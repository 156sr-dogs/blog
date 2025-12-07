/**
 * hCaptcha 集成模块
 * 负责 hCaptcha 的初始化和回调处理
 */

class HCaptchaIntegration extends VerificationSystem {
    constructor() {
        super();
        
        // 确保元素存在才获取
    this.additionalElements = {};
    
    const elementIds = [
        'hcaptchaContainer',
        'fallbackCaptchaContainer', 
        'fallbackNotice',
        'captchaModeIndicator',
        'switchCaptchaMode',  // 注意这里
        'captchaStatusDot',
        'captchaStatusText'
    ];
    
    elementIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            // 将 id 转换为属性名（将 switchCaptchaMode 转为 switchCaptchaModeBtn）
            const propName = id === 'switchCaptchaMode' ? 'switchCaptchaModeBtn' : id;
            this.additionalElements[propName] = element;
        } else {
            console.warn(`元素 ${id} 未找到`);
        }
    });
    
    this.verificationState.hcaptchaLoaded = false;
    this.initHCaptcha();
}
    
    init() {
        // 等待 DOM 完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                super.init();
                this.setupModeSwitchListeners();
                this.checkHCaptchaLoadStatus();
            });
        } else {
            super.init();
            this.setupModeSwitchListeners();
            this.checkHCaptchaLoadStatus();
        }
    }
    
    // 检查 hCaptcha 是否成功加载
    checkHCaptchaLoadStatus() {
        const checkInterval = setInterval(() => {
            if (window.hcaptcha) {
                this.verificationState.hcaptchaLoaded = true;
                this.updateCaptchaStatus('hcaptcha', true);
                clearInterval(checkInterval);
                
                // 10秒后如果还没有加载，则自动切换到备用模式
                setTimeout(() => {
                    if (!this.verificationState.hcaptchaLoaded) {
                        console.warn('hCaptcha 加载超时，自动切换到备用模式');
                        this.switchToFallbackMode();
                    }
                }, 10000);
            }
        }, 500);
    }
    
    // 初始化 hCaptcha 系统
    initHCaptcha() {
        // 检查是否强制使用备用模式
        const urlParams = new URLSearchParams(window.location.search);
        const forceFallback = urlParams.get('forceFallback') === 'true';
        
        if (forceFallback) {
            console.log('强制使用备用验证模式');
            this.switchToFallbackMode();
            return;
        }
        
        // 检测网络连接状态
        if (!navigator.onLine) {
            console.warn('网络离线，使用备用验证模式');
            this.switchToFallbackMode();
            return;
        }
        
        // 检查是否被广告拦截器拦截
        setTimeout(() => {
            const hcaptchaElements = document.querySelectorAll('.h-captcha, [src*="hcaptcha"]');
            if (hcaptchaElements.length === 0) {
                console.warn('hCaptcha 元素未找到，可能被广告拦截器拦截');
                this.switchToFallbackMode();
            }
        }, 3000);
    }
    
    // 切换验证模式
    toggleVerificationMode() {
        if (this.verificationState.verificationMode === 'hcaptcha') {
            this.switchToFallbackMode();
        } else {
            this.switchToHCaptchaMode();
        }
    }
    
    // 切换到 hCaptcha 模式
    switchToHCaptchaMode() {
        if (!this.verificationState.hcaptchaLoaded) {
            this.showStatusMessage('hCaptcha 加载失败，无法切换到该模式', 'error');
            return;
        }
        
        this.verificationState.verificationMode = 'hcaptcha';
        this.additionalElements.hcaptchaContainer.classList.remove('hidden');
        this.additionalElements.fallbackCaptchaContainer.classList.add('hidden');
        this.additionalElements.fallbackNotice.classList.add('hidden');
        
        this.additionalElements.captchaModeIndicator.textContent = '验证模式: hCaptcha';
        this.additionalElements.switchCaptchaModeBtn.textContent = '切换到备用验证';
        
        this.verificationState.captchaVerified = false;
        this.verificationState.captchaToken = null;
        
        // 重置 hCaptcha
        if (window.hcaptcha) {
            const widget = document.querySelector('.h-captcha');
            if (widget && widget.dataset.sitekey) {
                const widgetId = hcaptcha.getResponse();
                if (widgetId) {
                    hcaptcha.reset(widgetId);
                }
            }
        }
        
        this.updateButtonState();
        this.showStatusMessage('已切换到 hCaptcha 验证模式', 'info');
        this.updateCaptchaStatus('hcaptcha', this.verificationState.hcaptchaLoaded);
    }
    
    // 切换到备用验证模式
    switchToFallbackMode() {
        this.verificationState.verificationMode = 'fallback';
        this.additionalElements.hcaptchaContainer.classList.add('hidden');
        this.additionalElements.fallbackCaptchaContainer.classList.remove('hidden');
        this.additionalElements.fallbackNotice.classList.remove('hidden');
        
        this.additionalElements.captchaModeIndicator.textContent = '验证模式: 备用验证';
        this.additionalElements.switchCaptchaModeBtn.textContent = '切换到 hCaptcha';
        
        this.verificationState.captchaVerified = false;
        this.verificationState.captchaToken = null;
        
        // 重新生成数学问题
        if (window.fallbackCaptcha) {
            window.fallbackCaptcha.reset();
        }
        
        this.updateButtonState();
        this.showStatusMessage('已切换到备用验证模式', 'info');
        this.updateCaptchaStatus('fallback', true);
    }
    
    // hCaptcha 验证成功回调
    onCaptchaVerified(token) {
        console.log('hCaptcha 验证成功，token:', token.substring(0, 20) + '...');
        this.verificationState.captchaVerified = true;
        this.verificationState.captchaToken = token;
        this.updateButtonState();
        this.updateCaptchaStatus('hcaptcha', true);
        this.showCaptchaStatus('验证通过', 'success');
    }
    
    // hCaptcha 验证过期回调
    onCaptchaExpired() {
        console.log('hCaptcha 验证已过期');
        this.verificationState.captchaVerified = false;
        this.verificationState.captchaToken = null;
        this.updateButtonState();
        this.showCaptchaStatus('验证已过期，请重新验证', 'error');
    }
    
    // hCaptcha 错误回调
    onCaptchaError() {
        console.log('hCaptcha 验证错误');
        this.verificationState.captchaVerified = false;
        this.verificationState.captchaToken = null;
        this.updateButtonState();
        this.showCaptchaStatus('验证错误，请重试', 'error');
        
        // 如果连续多次错误，自动切换到备用模式
        setTimeout(() => {
            this.switchToFallbackMode();
        }, 2000);
    }
    
    // 显示验证码状态
    showCaptchaStatus(message, type = 'info') {
        const statusElement = document.getElementById('hcaptchaStatus');
        if (statusElement) {
            const icons = {
                'info': '⏳',
                'success': '✅',
                'error': '❌',
                'warning': '⚠️'
            };
            
            statusElement.innerHTML = `
                <span class="status-icon">${icons[type] || '⏳'}</span>
                <span class="status-text">${message}</span>
            `;
            
            statusElement.className = `captcha-status captcha-status-${type}`;
            
            // 如果是错误消息，3秒后恢复
            if (type === 'error') {
                setTimeout(() => {
                    this.showCaptchaStatus('等待验证...', 'info');
                }, 3000);
            }
        }
    }
    
    // 更新验证码状态指示器
    updateCaptchaStatus(mode, isAvailable) {
        if (this.additionalElements.captchaStatusDot) {
            this.additionalElements.captchaStatusDot.className = `status-dot ${isAvailable ? 'active' : 'inactive'}`;
        }
        
        if (this.additionalElements.captchaStatusText) {
            const statusText = mode === 'hcaptcha' 
                ? (isAvailable ? 'hCaptcha 服务正常' : 'hCaptcha 服务异常')
                : '备用验证系统正常';
            this.additionalElements.captchaStatusText.textContent = statusText;
        }
    }
    
    // 实现抽象方法
    getCurrentCaptchaToken() {
        if (this.verificationState.verificationMode === 'hcaptcha') {
            if (this.verificationState.captchaVerified && this.verificationState.captchaToken) {
                return {
                    token: this.verificationState.captchaToken,
                    type: 'hcaptcha'
                };
            }
            return null;
        } else {
            // 备用验证模式
            if (window.fallbackCaptcha) {
                const token = window.fallbackCaptcha.getCurrentToken();
                if (token) {
                    return {
                        token: token,
                        type: 'fallback_math'
                    };
                }
            }
            return null;
        }
    }
    
    resetCaptcha() {
        if (this.verificationState.verificationMode === 'hcaptcha') {
            if (window.hcaptcha) {
                const widget = document.querySelector('.h-captcha');
                if (widget && widget.dataset.sitekey) {
                    const widgetId = hcaptcha.getResponse();
                    if (widgetId) {
                        hcaptcha.reset(widgetId);
                    }
                }
            }
            this.verificationState.captchaVerified = false;
            this.verificationState.captchaToken = null;
            this.showCaptchaStatus('请重新验证', 'info');
        } else {
            // 备用验证模式
            if (window.fallbackCaptcha) {
                window.fallbackCaptcha.reset();
            }
        }
    }
    
    updateButtonState() {
        const hasInput = this.elements.accessKeyInput.value.trim().length > 0;
        
        let captchaValid = false;
        
        if (this.verificationState.verificationMode === 'hcaptcha') {
            captchaValid = this.verificationState.captchaVerified;
        } else {
            // 备用验证模式：检查是否有数学答案输入
            const mathAnswerInput = document.getElementById('mathAnswer');
            captchaValid = mathAnswerInput && mathAnswerInput.value.trim().length > 0;
        }
        
        this.elements.verifyBtn.disabled = 
            !hasInput || 
            !captchaValid || 
            this.verificationState.isVerifying;
    }
}
