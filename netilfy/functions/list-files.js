const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

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

function getFileList() {
  try {
    if (!fs.existsSync(CONFIG.DOWNLOADS_DIR)) {
      console.log('下载目录不存在:', CONFIG.DOWNLOADS_DIR);
      return [];
    }
    
    const files = fs.readdirSync(CONFIG.DOWNLOADS_DIR);
    
    return files.map(filename => {
      const filePath = path.join(CONFIG.DOWNLOADS_DIR, filename);
      const stats = fs.statSync(filePath);
      
      return {
        id: Buffer.from(filename).toString('base64'),
        name: filename,
        displayName: path.parse(filename).name,
        size: stats.size,
        formattedSize: formatFileSize(stats.size),
        type: getFileType(filename),
        icon: getFileIcon(filename),
        lastModified: stats.mtime,
        downloadUrl: `/api/download?file=${Buffer.from(filename).toString('base64')}`
      };
    }).sort((a, b) => b.lastModified - a.lastModified);
    
  } catch (error) {
    console.error('读取文件列表错误:', error);
    return [];
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  const types = {
    '.pdf': 'PDF 文档',
    '.zip': '压缩文件',
    '.rar': '压缩文件',
    '.7z': '压缩文件',
    '.exe': '应用程序',
    '.msi': '安装程序',
    '.doc': 'Word 文档',
    '.docx': 'Word 文档',
    '.xls': 'Excel 表格',
    '.xlsx': 'Excel 表格',
    '.ppt': 'PPT 演示',
    '.pptx': 'PPT 演示',
    '.jpg': '图片',
    '.jpeg': '图片',
    '.png': '图片',
    '.gif': '图片',
    '.mp4': '视频',
    '.mp3': '音频',
    '.txt': '文本文档',
    '.md': 'Markdown 文件'
  };
  
  return types[ext] || '未知文件';
}

function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  const icons = {
    '.pdf': '📄',
    '.zip': '📦',
    '.rar': '📦',
    '.7z': '📦',
    '.exe': '⚙️',
    '.msi': '⚙️',
    '.doc': '📝',
    '.docx': '📝',
    '.xls': '📊',
    '.xlsx': '📊',
    '.ppt': '📽️',
    '.pptx': '📽️',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.png': '🖼️',
    '.gif': '🖼️',
    '.mp4': '🎬',
    '.mp3': '🎵',
    '.txt': '📄',
    '.md': '📄'
  };
  
  return icons[ext] || '📄';
}

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '只允许GET请求' })
    };
  }
  
  try {
    const clientIP = event.headers['client-ip'] || 
                     event.headers['x-forwarded-for'] || 
                     'unknown';
    
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
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
        headers,
        body: JSON.stringify({ 
          success: false,
          error: '验证失败',
          reason: tokenVerification.reason
        })
      };
    }
    
    const files = getFileList();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        files: files,
        count: files.length,
        serverTime: new Date().toISOString(),
        sessionExpires: tokenVerification.decoded.exp * 1000
      })
    };
    
  } catch (error) {
    console.error('获取文件列表错误:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '服务器内部错误'
      })
    };
  }
};