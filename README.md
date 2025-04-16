# aiChatBot

## 本地部署教程:

### 一、代码下载
从github下载工程代码，路径为：https://github.com/feiniu002/aiChatBot

### 二、后端程序本地部署
1. 命令行cd进入后端代码路径
    例如我的是：cd D:\GitHub\aiChatBot\backend

2. 创建虚拟环境
```
py -m venv .venv
```

3. 激活虚拟环境
```
.venv\Scripts\activate
```

4. 安装所需依赖（**用到的库比较多，请耐心等待**）
```
pip install -r requirements.txt
```

5. Django系统配置（首次运行才需要，以后不再需要）
```
# 创建数据库迁移文件
python manage.py makemigrations
# 应用这些迁移到数据库
python manage.py migrate
# 创建超级管理员账号
python manage.py createsuperuser
```

6. 命令行开启后端服务
```
python manage.py runserver
```

7. 看到如下log代表启动成功
```
Django version 5.2, using settings 'config.settings'
Starting development server at http://127.0.0.1:8000/
Quit the server with CTRL-BREAK.
```

### 三、前端程序本地部署
1. 命令行cd进入前端代码路径
    例如我的是：cd D:\GitHub\aiChatBot\frontend

2. 安装项目依赖
```
pnpm install
```

3. 启动前端程序
```
pnpm dev
```

4. 看到如下log代表启动成功
```
D:\GitHub\aiChatBot\frontend>pnpm dev

> my-v0-project@0.1.0 dev D:\GitHub\aiChatBot\frontend
> next dev

   ▲ Next.js 15.2.4
   - Local:        http://localhost:3000
   - Network:      http://172.21.144.1:3000
   - Experiments (use with caution):
     ✓ webpackBuildWorker
     ✓ parallelServerCompiles
     ✓ parallelServerBuildTraces

 ✓ Starting...
 ✓ Ready in 3.3s
```

### 四、本地测试
1. 访问http://localhost:3000进行测试
