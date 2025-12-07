const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fetch = require('node-fetch');

// 配置
const CONFIG = {
  ACCESS_KEY_SECRET: process.env.ACCESS_KEY_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  HCAPTCHA_SECRET: process.env.HCAPTCHA_SECRET,
  HCAPTCHA_VERIFY_URL: 'https://hcaptcha.com/siteverify',
  FALLBACK_SECRET: process.env.FALLBACK_SECRET,
  SESSION_DURATION: 30 * 60 * 1000,
  MAX_ATTEMPTS: 5,
  COOLDOWN_TIME: 5 * 60 * 1000
};

// 速率限制器
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
});

const attemptStore = new Map();

// 验证 hCaptcha token
async function verifyHCaptcha(token, clientIP) {
  try {
    if (process.env.NODE_ENV === 'development' && token === 'test_bypass') {
      console.log('开发模式：跳过 hCaptcha 验证');
      return { success: true, score: 0.9, hostname: 'localhost' };
    }
    
    if (!token || token === 'simple_captcha_placeholder') {
      return { success: false, error: '无效的验证码token' };
    }
    
    const response = await fetch(CONFIG.HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: CONFIG.HCAPTCHA_SECRET,
        response: token,
        remoteip: clientIP
      }).toString()
    });
    
    const data = await response.json();
    
    return {
      success: data.success === true,
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
      credit: data.credit,
      score: data.score,
      errorCodes: data['error-codes']
    };
    
  } catch (error) {
    console.error('hCaptcha 验证失败:', error);
    return {
      success: false,
      error: 'hCaptcha 服务暂时不可用',
      fallbackRecommended: true
    };
  }
}

// 验证备用数学验证 token
function verifyFallbackCaptcha(token, clientIP) {
  try {
    const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
    
    const { problemId, answer, timestamp, type, sig } = decodedData;
    
    if (type !== 'math_captcha') {
      return { success: false, error: '无效的验证类型' };
    }
    
    const currentTime = Date.now();
    if (currentTime - timestamp > 5 * 60 * 1000) {
      return { success: false, error: '验证已过期，请重新验证' };
    }
    
    const expectedSig = createSignature(problemId, answer, timestamp, type);
    if (sig !== expectedSig) {
      return { success: false, error: '验证签名无效' };
    }
    
    return {
      success: true,
      problemId: problemId,
      timestamp: new Date(timestamp).toISOString(),
      fallbackUsed: true
    };
    
  } catch (error) {
    console.error('备用验证失败:', error);
    return {
      success: false,
      error: '备用验证失败',
      fallbackRecommended: false
    };
  }
}

// 创建签名
function createSignature(problemId, answer, timestamp, type) {
  const str = `${problemId}-${answer}-${timestamp}-${type}`;
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16);
}

// 验证访问密钥
function verifyAccessKey(accessKey) {
  try {
    return accessKey === CONFIG.ACCESS_KEY_SECRET;
  } catch (error) {
    console.error('密钥验证错误:', error);
    return false;
  }
}

async function checkRateLimit(ip) {
  try {
    await rateLimiter.consume(ip);
    return { allowed: true, remaining: null };
  } catch (rlRejected) {
    return { 
      allowed: false, 
      remaining: Math.ceil(rlRejected.msBeforeNext / 1000) 
    };
  }
}

function generateToken(ip, verificationMethod = 'hcaptcha') {
  const payload = {
    sub: 'download-access',
    ip: ip,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + CONFIG.SESSION_DURATION) / 1000),
    verification_method: verificationMethod
  };
  
  return jwt.sign(payload, CONFIG.JWT_SECRET, { algorithm: 'HS256' });
}

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '只允许POST请求' })
    };
  }
  
  try {
    const body = JSON.parse(event.body);
    const { accessKey, captchaToken, captchaType = 'hcaptcha' } = body;
    const clientIP = event.headers['client-ip'] || 
                     event.headers['x-forwarded-for'] || 
                     'unknown';
    
    console.log('验证请求:', {
      ip: clientIP,
      captchaType: captchaType,
      timestamp: new Date().toISOString()
    });
    
    const rateLimitCheck = await checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          error: '尝试次数过多',
          retryAfter: rateLimitCheck.remaining
        })
      };
    }
    
    let captchaResult;
    let verificationMethod = captchaType;
    
    if (captchaType === 'hcaptcha') {
      captchaResult = await verifyHCaptcha(captchaToken, clientIP);
      
      if (!captchaResult.success && captchaResult.fallbackRecommended) {
        console.log('hCaptcha 验证失败，建议使用备用验证');
        verificationMethod = 'fallback_recommended';
      }
    } else if (captchaType === 'fallback_math') {
      captchaResult = verifyFallbackCaptcha(captchaToken, clientIP);
      verificationMethod = 'fallback_math';
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: '不支持的验证类型'
        })
      };
    }
    
    if (!captchaResult.success) {
      let errorMessage = captchaResult.error || '人机验证失败';
      
      if (captchaResult.error && captchaResult.error.includes('服务暂时不可用')) {
        errorMessage += '，建议使用备用验证方式';
      }
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          fallbackRecommended: captchaResult.fallbackRecommended || false,
          captchaType: captchaType
        })
      };
    }
    
    if (!verifyAccessKey(accessKey)) {
      const attempts = (attemptStore.get(clientIP) || 0) + 1;
      attemptStore.set(clientIP, attempts);
      
      setTimeout(() => {
        attemptStore.delete(clientIP);
      }, CONFIG.COOLDOWN_TIME);
      
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: '访问密钥无效',
          attemptsRemaining: CONFIG.MAX_ATTEMPTS - attempts,
          retryAfter: attempts >= CONFIG.MAX_ATTEMPTS ? 
            Math.ceil(CONFIG.COOLDOWN_TIME / 1000) : null,
          captchaType: captchaType
        })
      };
    }
    
    const token = generateToken(clientIP, verificationMethod);
    attemptStore.delete(clientIP);
    
    console.log('验证成功:', {
      ip: clientIP,
      time: new Date().toISOString(),
      verificationMethod: verificationMethod,
      captchaScore: captchaResult.score
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token: token,
        expiresIn: CONFIG.SESSION_DURATION / 1000,
        redirectUrl: '/download.html',
        verificationMethod: verificationMethod,
        fallbackUsed: verificationMethod.includes('fallback')
      })
    };
    
  } catch (error) {
    console.error('验证错误:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '服务器内部错误',
        fallbackRecommended: true,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};