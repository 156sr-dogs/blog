// 修改 script.js，确保在全局作用域中定义回调函数
document.addEventListener('DOMContentLoaded', () => {
    // 创建验证系统实例
    window.verificationSystem = new HCaptchaIntegration();
    
    // 确保 hCaptcha 回调函数在全局可访问
    window.onCaptchaVerified = (token) => {
        if (window.verificationSystem) {
            window.verificationSystem.onCaptchaVerified(token);
        }
    };
    
    window.onCaptchaExpired = () => {
        if (window.verificationSystem) {
            window.verificationSystem.onCaptchaExpired();
        }
    };
    
    window.onCaptchaError = () => {
        if (window.verificationSystem) {
            window.verificationSystem.onCaptchaError();
        }
    };
    
    // 如果 hCaptcha 没有加载，自动切换到备用模式
    setTimeout(() => {
        if (!window.hcaptcha) {
            console.warn('hCaptcha 未加载，自动切换到备用模式');
            window.verificationSystem.switchToFallbackMode();
        }
    }, 5000);
    
    // 更新最后更新时间
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
        lastUpdate.textContent = new Date().toISOString().split('T')[0];
    }
});