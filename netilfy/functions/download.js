const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mime = require('mime-types');

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET,
  DOWNLOADS_DIR: process.env.NETLIFY ? 
    path.join(process.cwd(), 'downloads') : 
    path.join(__dirname, '../../downloads')
};

function verifyToken(token, ip) {
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET, { algorithms: ['HS256'] });
    
    if (decoded.ip !== ip) {
      return { valid: false, reason: 'IP地址不匹配' };
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      return { valid: false, reason: '令牌已过期' };
    }
    
    return { valid: true, decoded };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

function decodeFilename(encodedName) {
  try {
    return Buffer.from(encodedName, 'base64').toString('utf-8');
  } catch (error) {
    return null;
  }
}

function isSafeFilename(filename) {
  const normalizedPath = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
  
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = [
    '.pdf', '.zip', '.rar', '.7z', '.doc', '.docx', 
    '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', 
    '.png', '.gif', '.mp4', '.mp3', '.txt', '.md'
  ];
  
  return allowedExtensions.includes(ext);
}

exports.handler = async function(event, context) {
  const clientIP = event.headers['client-ip'] || 
                   event.headers['x-forwarded-for'] || 
                   'unknown';
  
  const { file: encodedFilename } = event.queryStringParameters;
  
  if (!encodedFilename) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: '请指定文件参数'
    };
  }
  
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false,
        error: '未授权访问'
      })
    };
  }
  
  const token = authHeader.substring(7);
  
  const tokenVerification = verifyToken(token, clientIP);
  if (!tokenVerification.valid) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false,
        error: '验证失败',
        reason: tokenVerification.reason
      })
    };
  }
  
  const filename = decodeFilename(encodedFilename);
  if (!filename || !isSafeFilename(filename)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: '无效的文件名'
    };
  }
  
  const filePath = path.join(CONFIG.DOWNLOADS_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: '文件不存在'
    };
  }
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    const mimeType = mime.lookup(filename) || 'application/octet-stream';
    
    const headers = {
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    };
    
    return {
      statusCode: 200,
      headers,
      body: fileBuffer.toString('base64'),
      isBase64Encoded: true
    };
    
  } catch (error) {
    console.error('文件下载错误:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: '文件下载失败'
    };
  }
};