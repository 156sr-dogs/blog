/**
 * 下载页面主逻辑
 * 负责文件列表加载和下载管理
 */

class DownloadManager {
    constructor() {
        this.token = localStorage.getItem('download_token');
        this.expiryTime = parseInt(localStorage.getItem('token_expires')) || 0;
        this.files = [];
        this.totalSize = 0;
        this.timerInterval = null;
        
        this.elements = {
            sessionTime: document.getElementById('sessionTime'),
            sessionExpiry: document.getElementById('sessionExpiry'),
            fileCount: document.getElementById('fileCount'),
            totalSize: document.getElementById('totalSize'),
            resourcesGrid: document.getElementById('resourcesGrid'),
            loading: document.getElementById('loading'),
            emptyState: document.getElementById('emptyState'),
            logoutBtn: document.getElementById('logoutBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            downloadToast: document.getElementById('downloadToast'),
            toastMessage: document.getElementById('toastMessage'),
            lastUpdate: document.getElementById('lastUpdate')
        };
        
        this.init();
    }
    
    async init() {
        if (!this.checkSession()) {
            this.redirectToVerification();
            return;
        }
        
        this.setupEventListeners();
        
        if (this.elements.lastUpdate) {
            this.elements.lastUpdate.textContent = new Date().toLocaleDateString('zh-CN');
        }
        
        await this.loadFileList();
        this.updateSessionTimer();
    }
    
    checkSession() {
        if (!this.token) {
            console.log('未找到令牌');
            return false;
        }
        
        if (Date.now() > this.expiryTime) {
            console.log('令牌已过期');
            return false;
        }
        
        return true;
    }
    
    setupEventListeners() {
        if (this.elements.logoutBtn) {
            this.elements.logoutBtn.addEventListener('click', () => this.logout());
        }
        
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => this.reloadFiles());
        }
    }
    
    async loadFileList() {
        try {
            this.showLoading(true);
            
            const response = await fetch('/.netlify/functions/list-files', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (response.status === 401) {
                this.logout();
                return;
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.files = data.files || [];
                this.renderFileList();
                this.updateFileStats();
                
                if (data.sessionExpires) {
                    this.expiryTime = data.sessionExpires;
                    localStorage.setItem('token_expires', this.expiryTime);
                }
            } else {
                throw new Error(data.error || '加载失败');
            }
            
        } catch (error) {
            console.error('加载文件列表失败:', error);
            this.showError('加载资源列表失败，请检查网络连接');
            
        } finally {
            this.showLoading(false);
        }
    }
    
    renderFileList() {
        if (this.files.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
            this.elements.resourcesGrid.innerHTML = '';
            return;
        }
        
        this.elements.emptyState.classList.add('hidden');
        
        const filesHTML = this.files.map(file => `
            <div class="resource-card" data-file-id="${file.id}">
                <div class="resource-header">
                    <div class="resource-icon">${file.icon || '📄'}</div>
                    <div class="resource-meta">
                        <span class="file-type">${file.type}</span>
                        <span class="file-size">${file.formattedSize}</span>
                    </div>
                </div>
                
                <div class="resource-body">
                    <h3 title="${file.displayName}">${file.displayName}</h3>
                    <p class="file-date">
                        更新: ${new Date(file.lastModified).toLocaleDateString('zh-CN')}
                    </p>
                </div>
                
                <div class="resource-footer">
                    <button class="btn-download" data-file-id="${file.id}">
                        <span class="download-icon">⬇️</span>
                        下载文件
                    </button>
                </div>
            </div>
        `).join('');
        
        this.elements.resourcesGrid.innerHTML = filesHTML;
        
        document.querySelectorAll('.btn-download').forEach(button => {
            button.addEventListener('click', (e) => {
                const fileId = e.target.dataset.fileId || 
                              e.target.closest('.btn-download').dataset.fileId;
                this.downloadFile(fileId);
            });
        });
    }
    
    async downloadFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) {
            this.showToast('文件不存在', 'error');
            return;
        }
        
        try {
            this.showToast(`正在下载：${file.displayName}`, 'info');
            
            const downloadUrl = `/.netlify/functions/download?file=${encodeURIComponent(fileId)}`;
            
            const response = await fetch(downloadUrl, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return;
                }
                throw new Error('下载失败');
            }
            
            const contentDisposition = response.headers.get('content-disposition');
            let filename = file.name;
            
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?(.+)"?/i);
                if (match) {
                    filename = match[1];
                }
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);
            
            this.showToast(`开始下载：${filename}`, 'success');
            this.logDownload(file.name, file.size);
            
        } catch (error) {
            console.error('下载文件失败:', error);
            this.showToast('文件下载失败，请检查网络连接或会话状态', 'error');
        }
    }
    
    logDownload(filename, size) {
        const logs = JSON.parse(localStorage.getItem('download_logs') || '[]');
        
        logs.push({
            filename: filename,
            size: size,
            timestamp: new Date().toISOString(),
            ip: '用户IP'
        });
        
        if (logs.length > 100) {
            logs.splice(0, logs.length - 100);
        }
        
        localStorage.setItem('download_logs', JSON.stringify(logs));
    }
    
    updateFileStats() {
        const count = this.files.length;
        this.totalSize = this.files.reduce((sum, file) => sum + (file.size || 0), 0);
        
        this.elements.fileCount.textContent = count;
        this.elements.totalSize.textContent = this.formatBytes(this.totalSize);
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    updateSessionTimer() {
        const update = () => {
            const remaining = this.expiryTime - Date.now();
            
            if (remaining <= 0) {
                this.logout();
                return;
            }
            
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            
            this.elements.sessionTime.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            this.elements.sessionExpiry.textContent = `${minutes}分钟`;
        };
        
        update();
        this.timerInterval = setInterval(update, 1000);
    }
    
    showLoading(show) {
        if (show) {
            this.elements.loading.style.display = 'block';
            this.elements.resourcesGrid.style.display = 'none';
        } else {
            this.elements.loading.style.display = 'none';
            this.elements.resourcesGrid.style.display = 'grid';
        }
    }
    
    showError(message) {
        this.elements.resourcesGrid.innerHTML = `
            <div class="error-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <div class="error-icon" style="font-size: 3rem; margin-bottom: 20px; color: #ff4757;">⚠️</div>
                <h3 style="margin-bottom: 10px; color: #fff;">加载失败</h3>
                <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 20px;">${message}</p>
                <button class="btn-retry" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; padding: 12px 30px; border-radius: 10px; cursor: pointer; transition: all 0.3s ease;">
                    重试加载
                </button>
            </div>
        `;
        
        document.querySelector('.btn-retry').addEventListener('click', () => {
            this.reloadFiles();
        });
    }
    
    reloadFiles() {
        this.loadFileList();
    }
    
    showToast(message, type = 'info') {
        this.elements.toastMessage.textContent = message;
        this.elements.downloadToast.classList.remove('hidden');
        
        const colors = {
            'info': '#00e0ff',
            'success': '#4cd964',
            'error': '#ff4757',
            'warning': '#ffcc00'
        };
        
        this.elements.downloadToast.style.borderColor = `${colors[type]}40`;
        
        setTimeout(() => {
            this.elements.downloadToast.classList.add('hidden');
        }, 3000);
    }
    
    logout() {
        localStorage.removeItem('download_token');
        localStorage.removeItem('token_expires');
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.showToast('已安全登出', 'info');
        
        setTimeout(() => {
            this.redirectToVerification();
        }, 1000);
    }
    
    redirectToVerification() {
        window.location.href = '/';
    }
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    const downloadManager = new DownloadManager();
    window.downloadManager = downloadManager;
});