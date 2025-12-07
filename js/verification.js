/**
 * 验证系统核心模块
 * 负责验证逻辑、状态管理和网络请求
 */

class VerificationSystem {
    constructor() {
        this.verificationState = {
            isVerifying: false,
            attempts: 0,
            maxAttempts: 5,
            lastAttempt: 0,
            cooldownTime: 5 * 60 * 1000,
            captchaVerified: false,
            captchaToken: null,
            verificationMode: 'hcaptcha',
            fallbackEnabled: false,
            hcaptchaLoaded: false
        };
        
        this.elements = {
            accessKeyInput: document.getElementById('accessKey'),
            togglePassword: document.getElementById('togglePassword'),
            verifyBtn: document.getElementById('verifyBtn'),
            btnText: document.getElementById('btnText'),
            loadingSpinner: document.getElementById('loadingSpinner'),
            statusMessage: document.getElementById('statusMessage'),
            verificationForm: document.getElementById('verificationForm')
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateButtonState();
        this.checkRateLimit();
    }
    
    setupEventListeners() {
        // 切换密码显示
        if (this.elements.togglePassword) {
            this.elements.togglePassword.addEventListener('click', () => {
                const type = this.elements.accessKeyInput.getAttribute('type');
                this.elements.accessKeyInput.setAttribute(
                    'type', 
                    type === 'password' ? 'text' : 'password'
                );
                this.elements.togglePassword.textContent = 
                    type === 'password' ? '🙈' : '👁️';
            });
        }
        
        // 验证按钮点击
        if (this.elements.verifyBtn) {
            this.elements.verifyBtn.addEventListener('click', () => this.verifyAccessKey());
        }
        
        // 输入框回车提交
        if (this.elements.accessKeyInput) {
            this.elements.accessKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.verifyAccessKey();
                }
            });
            
            // 输入时更新按钮状态
            this.elements.accessKeyInput.addEventListener('input', () => {
                this.hideStatusMessage();
                this.updateButtonState();
            });
        }
    }
    
    updateButtonState() {
        const hasInput = this.elements.accessKeyInput.value.trim().length > 0;
        this.elements.verifyBtn.disabled = 
            !hasInput || 
            this.verificationState.isVerifying;
    }
    
    async verifyAccessKey() {
        if (this.verificationState.isVerifying) return;
        
        const accessKey = this.elements.accessKeyInput.value.trim();
        
        if (!accessKey) {
            this.showStatusMessage('请输入访问密钥', 'error');
            return;
        }
        
        // 获取验证码令牌
        const captchaInfo = this.getCurrentCaptchaToken();
        if (!captchaInfo) {
            this.showStatusMessage('请先完成人机验证', 'error');
            return;
        }
        
        // 检查速率限制
        if (!this.checkRateLimit()) {
            return;
        }
        
        this.verificationState.isVerifying = true;
        this.elements.btnText.textContent = '正在验证...';
        this.elements.loadingSpinner.classList.remove('hidden');
        this.elements.verifyBtn.disabled = true;
        
        try {
            const response = await this.sendVerificationRequest(accessKey, captchaInfo);
            await this.handleVerificationResponse(response);
            
        } catch (error) {
            await this.handleVerificationError(error);
            
        } finally {
            this.resetVerificationState();
        }
    }
    
    async sendVerificationRequest(accessKey, captchaInfo) {
        const response = await fetch('/.netlify/functions/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                accessKey: accessKey,
                captchaToken: captchaInfo.token,
                captchaType: captchaInfo.type
            })
        });
        
        return response.json();
    }
    
    async handleVerificationResponse(data) {
        if (data.success) {
            await this.handleSuccessResponse(data);
        } else {
            await this.handleErrorResponse(data);
        }
    }
    
    async handleSuccessResponse(data) {
        // 存储令牌
        localStorage.setItem('download_token', data.token);
        localStorage.setItem('token_expires', Date.now() + data.expiresIn * 1000);
        
        // 清除尝试记录
        this.resetAttempts();
        
        // 验证成功，重定向到下载页面
        this.showStatusMessage('验证成功！正在跳转...', 'success');
        
        setTimeout(() => {
            window.location.href = data.redirectUrl || '/download.html';
        }, 1000);
    }
    
    async handleErrorResponse(data) {
        // 记录失败尝试
        this.recordFailedAttempt();
        
        // 重置验证码
        this.resetCaptcha();
        
        // 显示错误信息
        this.showStatusMessage(
            data.error || '验证失败，请检查密钥',
            'error'
        );
        
        // 如果有剩余尝试次数信息，显示给用户
        if (data.attemptsRemaining !== undefined) {
            const remaining = this.verificationState.maxAttempts - this.verificationState.attempts;
            this.showStatusMessage(
                `验证失败，剩余尝试次数：${remaining}`,
                'error',
                5000
            );
        }
        
        // 如果是因为验证码失败，建议切换验证方式
        if (data.error && data.error.includes('验证码')) {
            setTimeout(() => {
                this.showStatusMessage('建议尝试切换验证方式', 'info', 3000);
            }, 2000);
        }
    }
    
    async handleVerificationError(error) {
        console.error('验证请求失败:', error);
        this.showStatusMessage('网络错误，请稍后重试', 'error');
        
        // 记录失败尝试
        this.recordFailedAttempt();
        
        // 网络错误时自动切换到备用验证
        if (this.verificationState.verificationMode === 'hcaptcha') {
            setTimeout(() => {
                if (window.verificationSystem && window.verificationSystem.switchToFallbackMode) {
                    window.verificationSystem.switchToFallbackMode();
                    this.showStatusMessage('网络异常，已切换到备用验证', 'warning');
                }
            }, 1000);
        }
    }
    
    resetVerificationState() {
        this.verificationState.isVerifying = false;
        this.elements.btnText.textContent = '验证密钥';
        this.elements.loadingSpinner.classList.add('hidden');
        this.updateButtonState();
    }
    
    // 抽象方法，由子类实现
    getCurrentCaptchaToken() {
        throw new Error('子类必须实现 getCurrentCaptchaToken 方法');
    }
    
    resetCaptcha() {
        throw new Error('子类必须实现 resetCaptcha 方法');
    }
    
    // 速率限制相关方法
    checkRateLimit() {
        const now = Date.now();
        const storedAttempts = localStorage.getItem('verification_attempts');
        const lastAttempt = localStorage.getItem('last_attempt');
        
        if (storedAttempts && lastAttempt) {
            this.verificationState.attempts = parseInt(storedAttempts);
            this.verificationState.lastAttempt = parseInt(lastAttempt);
            
            const timeSinceLastAttempt = now - this.verificationState.lastAttempt;
            
            if (this.verificationState.attempts >= this.verificationState.maxAttempts) {
                if (timeSinceLastAttempt < this.verificationState.cooldownTime) {
                    const remainingTime = Math.ceil(
                        (this.verificationState.cooldownTime - timeSinceLastAttempt) / 1000 / 60
                    );
                    this.showStatusMessage(
                        `尝试次数过多，请 ${remainingTime} 分钟后再试`,
                        'error'
                    );
                    this.elements.verifyBtn.disabled = true;
                    return false;
                } else {
                    // 重置计数器
                    this.resetAttempts();
                }
            }
        }
        
        return true;
    }
    
    recordFailedAttempt() {
        this.verificationState.attempts++;
        this.verificationState.lastAttempt = Date.now();
        
        localStorage.setItem('verification_attempts', this.verificationState.attempts);
        localStorage.setItem('last_attempt', this.verificationState.lastAttempt);
        
        // 如果达到最大尝试次数，开始冷却
        if (this.verificationState.attempts >= this.verificationState.maxAttempts) {
            this.showStatusMessage(
                `尝试次数过多，请 ${this.verificationState.cooldownTime / 1000 / 60} 分钟后再试`,
                'error'
            );
        }
    }
    
    resetAttempts() {
        this.verificationState.attempts = 0;
        this.verificationState.lastAttempt = 0;
        localStorage.removeItem('verification_attempts');
        localStorage.removeItem('last_attempt');
    }
    
    // 状态消息显示
    showStatusMessage(message, type = 'error', duration = 3000) {
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `status-message ${type}`;
        this.elements.statusMessage.classList.remove('hidden');
        
        setTimeout(() => {
            this.hideStatusMessage();
        }, duration);
    }
    
    hideStatusMessage() {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.classList.add('hidden');
        }
    }
}