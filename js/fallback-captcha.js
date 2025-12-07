/**
 * 备用数学验证系统
 * 当 hCaptcha 不可用时，提供数学问题验证
 */

class FallbackCaptchaSystem {
    constructor() {
        this.currentProblem = null;
        this.correctAnswer = null;
        this.problemId = null;
        
        this.initialize();
    }
    
    initialize() {
        this.generateMathProblem();
        this.setupEventListeners();
    }
    
    // 生成随机数学问题
    generateMathProblem() {
        const problems = [
            {
                type: 'addition',
                generate: () => {
                    const a = Math.floor(Math.random() * 20) + 1;
                    const b = Math.floor(Math.random() * 20) + 1;
                    return {
                        problem: `${a} + ${b} = ?`,
                        answer: a + b,
                        hint: `将 ${a} 和 ${b} 相加`
                    };
                }
            },
            {
                type: 'subtraction',
                generate: () => {
                    const a = Math.floor(Math.random() * 30) + 10;
                    const b = Math.floor(Math.random() * 10) + 1;
                    return {
                        problem: `${a} - ${b} = ?`,
                        answer: a - b,
                        hint: `从 ${a} 中减去 ${b}`
                    };
                }
            },
            {
                type: 'multiplication',
                generate: () => {
                    const a = Math.floor(Math.random() * 10) + 1;
                    const b = Math.floor(Math.random() * 10) + 1;
                    return {
                        problem: `${a} × ${b} = ?`,
                        answer: a * b,
                        hint: `计算 ${a} 乘以 ${b}`
                    };
                }
            },
            {
                type: 'simple_division',
                generate: () => {
                    const product = Math.floor(Math.random() * 50) + 10;
                    const divisor = Math.floor(Math.random() * 5) + 2;
                    const dividend = product * divisor;
                    return {
                        problem: `${dividend} ÷ ${divisor} = ?`,
                        answer: product,
                        hint: `将 ${dividend} 分成 ${divisor} 等份`
                    };
                }
            },
            {
                type: 'mix_operation',
                generate: () => {
                    const a = Math.floor(Math.random() * 10) + 1;
                    const b = Math.floor(Math.random() * 10) + 1;
                    const c = Math.floor(Math.random() * 10) + 1;
                    const operations = ['+', '-', '×'];
                    const op1 = operations[Math.floor(Math.random() * operations.length)];
                    const op2 = operations[Math.floor(Math.random() * operations.length)];
                    
                    let problem, answer;
                    if (op1 === '×' && op2 === '×') {
                        problem = `${a} × ${b} × ${c}`;
                        answer = a * b * c;
                    } else if (op1 === '×' && op2 === '+') {
                        problem = `${a} × ${b} + ${c}`;
                        answer = (a * b) + c;
                    } else if (op1 === '×' && op2 === '-') {
                        problem = `${a} × ${b} - ${c}`;
                        answer = (a * b) - c;
                    } else if (op1 === '+' && op2 === '×') {
                        problem = `${a} + ${b} × ${c}`;
                        answer = a + (b * c);
                    } else {
                        const temp1 = op1 === '+' ? a + b : a - b;
                        problem = `${a} ${op1} ${b} ${op2} ${c}`;
                        answer = op2 === '+' ? temp1 + c : temp1 - c;
                    }
                    
                    return {
                        problem: `${problem} = ?`,
                        answer: answer,
                        hint: "请按照数学运算顺序计算（先乘除后加减）"
                    };
                }
            }
        ];
        
        // 随机选择一个问题类型
        const problemType = problems[Math.floor(Math.random() * problems.length)];
        this.currentProblem = problemType.generate();
        this.correctAnswer = this.currentProblem.answer;
        this.problemId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        // 显示问题
        this.displayProblem();
        
        // 存储问题信息用于验证
        sessionStorage.setItem('captcha_problem_id', this.problemId);
        sessionStorage.setItem('captcha_answer_hash', this.hashAnswer(this.correctAnswer.toString()));
        
        return this.currentProblem;
    }
    
    // 显示数学问题
    displayProblem() {
        const problemElement = document.getElementById('mathProblem');
        if (problemElement && this.currentProblem) {
            problemElement.innerHTML = `
                <div class="math-expression">
                    <span class="math-numbers">${this.currentProblem.problem}</span>
                </div>
                <div class="math-instruction">
                    请计算上述表达式的结果
                </div>
            `;
        }
    }
    
    // 验证答案
    verifyAnswer(userAnswer) {
        if (!userAnswer || userAnswer.trim() === '') {
            return {
                success: false,
                message: '请输入计算结果'
            };
        }
        
        const answerNum = parseInt(userAnswer);
        if (isNaN(answerNum)) {
            return {
                success: false,
                message: '请输入有效的数字'
            };
        }
        
        if (answerNum === this.correctAnswer) {
            const token = this.generateVerificationToken();
            
            return {
                success: true,
                message: '验证通过',
                token: token
            };
        } else {
            return {
                success: false,
                message: '计算结果错误，请重试'
            };
        }
    }
    
    // 生成验证令牌
    generateVerificationToken() {
        const timestamp = Date.now();
        const data = {
            problemId: this.problemId,
            answer: this.correctAnswer,
            timestamp: timestamp,
            type: 'math_captcha'
        };
        
        const signature = this.createSignature(data);
        
        return btoa(JSON.stringify({
            ...data,
            sig: signature
        }));
    }
    
    // 创建签名
    createSignature(data) {
        const str = `${data.problemId}-${data.answer}-${data.timestamp}-${data.type}`;
        let hash = 0;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return Math.abs(hash).toString(16);
    }
    
    // 哈希答案
    hashAnswer(answer) {
        let hash = 0;
        for (let i = 0; i < answer.length; i++) {
            const char = answer.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    
    // 显示提示
    showHint() {
        if (this.currentProblem && this.currentProblem.hint) {
            this.showMessage(this.currentProblem.hint, 'info');
        }
    }
    
    // 显示消息
    showMessage(message, type = 'info') {
        const statusElement = document.getElementById('mathCaptchaStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <span class="status-icon">${type === 'info' ? '💡' : type === 'error' ? '❌' : '✅'}</span>
                <span class="status-text">${message}</span>
            `;
            
            statusElement.className = `captcha-status captcha-status-${type}`;
            
            if (type === 'error') {
                setTimeout(() => {
                    this.showMessage('请解答数学问题', 'info');
                }, 3000);
            }
        }
    }
    
    // 设置事件监听
    setupEventListeners() {
        // 刷新问题按钮
        const refreshBtn = document.getElementById('refreshMathProblem');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.generateMathProblem();
                this.showMessage('已刷新题目', 'info');
                
                const answerInput = document.getElementById('mathAnswer');
                if (answerInput) {
                    answerInput.value = '';
                    answerInput.focus();
                }
            });
        }
        
        // 提示按钮
        const hintBtn = document.getElementById('hintMathProblem');
        if (hintBtn) {
            hintBtn.addEventListener('click', () => {
                this.showHint();
            });
        }
        
        // 答案输入框
        const answerInput = document.getElementById('mathAnswer');
        if (answerInput) {
            answerInput.addEventListener('input', () => {
                // 实时验证逻辑
            });
        }
    }
    
    // 重置验证
    reset() {
        this.generateMathProblem();
        const answerInput = document.getElementById('mathAnswer');
        if (answerInput) {
            answerInput.value = '';
        }
        this.showMessage('请解答数学问题', 'info');
    }
    
    // 获取当前验证令牌
    getCurrentToken() {
        if (!this.currentProblem) {
            this.generateMathProblem();
        }
        
        const answerInput = document.getElementById('mathAnswer');
        const userAnswer = answerInput ? answerInput.value : '';
        
        const verification = this.verifyAnswer(userAnswer);
        
        if (verification.success) {
            return verification.token;
        } else {
            this.showMessage(verification.message, 'error');
            return null;
        }
    }
}

// 全局实例
window.fallbackCaptcha = new FallbackCaptchaSystem();