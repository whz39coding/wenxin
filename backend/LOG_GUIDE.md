# 日志系统使用指南

## 概述
本项目采用了专业的日志系统，支持：
- ✅ 多级别日志输出（DEBUG, INFO, WARNING, ERROR, CRITICAL）
- ✅ 文件和控制台双输出
- ✅ 日志文件自动轮转（当文件达到指定大小时）
- ✅ 错误日志单独记录
- ✅ 可配置的日志格式和级别

## 配置

在 `.env` 文件中添加以下配置（可选，已有默认值）：

```env
# 日志级别：DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL=INFO

# 单个日志文件的最大大小（字节），默认10MB
LOG_MAX_BYTES=10485760

# 保留的备份日志文件数，默认10
LOG_BACKUP_COUNT=10
```

## 目录结构

日志文件将保存到 `backend/logs/` 目录：

```
backend/logs/
├── WenXinClassics Backend.log          # 所有日志
└── WenXinClassics Backend_error.log    # 仅错误及以上
```

每个日志文件轮转时会自动备份：
```
WenXinClassics Backend.log.1
WenXinClassics Backend.log.2
WenXinClassics Backend.log.3
...
```

## 使用方法

### 在任何模块中使用日志

```python
from core.logger import get_logger

logger = get_logger(__name__)

# 不同级别的日志
logger.debug("调试信息")
logger.info("信息提示")
logger.warning("警告信息")
logger.error("错误信息")
logger.critical("严重错误")
```

### 常见使用场景

#### 1. API 处理
```python
from fastapi import APIRouter
from core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)

@router.post("/api/upload")
async def upload_file(file: UploadFile):
    logger.info(f"开始上传文件: {file.filename}")
    try:
        # 处理文件
        logger.info(f"文件上传成功: {file.filename}")
    except Exception as e:
        logger.error(f"文件上传失败: {str(e)}", exc_info=True)
        raise
```

#### 2. 数据库操作
```python
logger.info(f"查询用户ID: {user_id}")
user = service.get_user(user_id)
if user:
    logger.info(f"用户查询成功: {user.username}")
else:
    logger.warning(f"用户不存在: {user_id}")
```

#### 3. 搜索和OCR操作
```python
logger.info("开始OCR识别")
logger.debug(f"OCR参数: {ocr_params}")
try:
    result = ocr_service.recognize(image)
    logger.info(f"OCR识别完成，检测到{len(result)}个文本块")
except Exception as e:
    logger.error("OCR识别失败", exc_info=True)
```

## 日志格式说明

日志格式为：
```
[时间] [级别] [模块:行号] 函数名() - 消息
```

示例：
```
[2026-03-26 10:30:45] [INFO] [main:70] lifespan() - 初始化后端资源...
[2026-03-26 10:30:46] [INFO] [core.database:120] initialize() - MySQL数据库连接正常
[2026-03-26 10:30:48] [ERROR] [api.uploads:85] upload_file() - 文件上传失败: 磁盘空间不足
```

## 生产环境建议

### 1. 设置日志级别
在生产环境设置 `LOG_LEVEL=WARNING` 或 `ERROR` 以减少日志输出：

```env
APP_ENV=production
LOG_LEVEL=WARNING
```

### 2. 定期清理日志
设置定时任务清理旧的日志文件（>30天）：

```bash
# Linux/Mac cron
0 0 * * * find /path/to/backend/logs -name "*.log.*" -mtime +30 -delete
```

### 3. 监控错误日志
定期检查错误日志文件以发现问题：

```bash
tail -f logs/WenXinClassics\ Backend_error.log
```

### 4. 日志备份
定期备份日志文件到远程存储或专门的日志系统（如ELK Stack）

## 故障排查

### 问题1：看不到日志文件
**解决方案**：
- 检查 `backend/logs/` 目录是否存在
- 检查 `.env` 文件中是否正确配置了 `LOG_DIR`
- 确保应用有足够的文件系统写权限

### 问题2：日志输出太多/太少
**解决方案**：
- 调整 `.env` 中的 `LOG_LEVEL` 参数
- DEBUG: 输出所有信息（开发用）
- INFO: 输出重要信息（默认）
- WARNING: 仅输出警告和错误
- ERROR: 仅输出错误

### 问题3：日志文件过大
**解决方案**：
- 处理逻辑：当单个文件达到 `LOG_MAX_BYTES` 时自动轮转
- 若文件增长过快，建议：
  - 增加 `LOG_LEVEL` 来减少输出
  - 减少 `LOG_MAX_BYTES` 以更频繁地轮转
  - 减少 `LOG_BACKUP_COUNT` 以保留较少备份

## 示例场景

### 部署后调试用户反馈的问题
1. 启用 DEBUG 级别：`LOG_LEVEL=DEBUG`
2. 重现问题
3. 查看 `logs/WenXinClassics Backend.log`：
   ```bash
   tail -100 logs/WenXinClassics\ Backend.log
   ```
4. 查找相关的时间戳和错误信息

### 监控生产环境性能
1. 使用标准 LOG_LEVEL=INFO
2. 定期检查错误日志：
   ```bash
   tail logs/WenXinClassics\ Backend_error.log
   ```
3. 使用 grep 过滤特定错误：
   ```bash
   grep "OCR识别失败" logs/WenXinClassics\ Backend.log
   grep "数据库连接" logs/WenXinClassics\ Backend.log
   ```



# 日志系统完善 - 变更总结

## 📋 项目概述
为WenXinClassics项目完成了专业的日志系统升级，解决了后台运行时无法查看应用日志的问题。

## ✅ 已完成的工作

### 1. 新建日志配置模块
**文件**: `backend/core/logger.py`

核心功能：
- ✅ 日志到文件的写入（带自动轮转）
- ✅ 日志到控制台的输出
- ✅ 错误日志单独记录
- ✅ 可配置的日志级别、格式和大小限制
- ✅ 自动创建logs目录

```python
from core.logger import setup_logging, get_logger

# 在应用启动时调用
setup_logging(
    app_name="WenXinClassics",
    log_level="INFO",
    log_dir="./logs"
)

# 在任何模块中使用
logger = get_logger(__name__)
logger.info("信息")
logger.error("错误")
```

### 2. 更新配置系统
**文件**: `backend/config/settings.py`

新增配置参数：
- `LOG_LEVEL` - 日志级别（DEBUG/INFO/WARNING/ERROR/CRITICAL）
- `LOG_DIR` - 日志目录
- `LOG_MAX_BYTES` - 单文件大小限制（默认10MB）
- `LOG_BACKUP_COUNT` - 备份文件数（默认10个）

这些参数都可以通过 `.env` 文件配置。

### 3. 更新应用入口
**文件**: `backend/main.py`

变更：
- 替换 `logging.basicConfig()` 为 `setup_logging()`
- 初始化日志系统时传入配置参数
- 使用新的 `get_logger()` 获取logger对象

### 4. 更新服务模块
以下模块已集成新的日志系统：

| 模块 | 文件 | 更变 |
|------|------|------|
| OCR服务 | `services/ocr/service.py` | ✅ 导入get_logger，替换所有logging调用 |
| 搜索服务 | `services/search/service.py` | ✅ 使用get_logger替换logging.getLogger |
| 用户服务 | `services/users/service.py` | ✅ 新增logger对象 |
| 上传服务 | `services/upload_book/service.py` | ✅ 使用get_logger替换logging |
| 数据库 | `core/database.py` | ✅ 使用get_logger替换logging.getLogger |

### 5. 创建配置示例
**文件**: `backend/.env.example`

包含所有日志相关配置的详细说明：
```env
LOG_LEVEL=INFO
LOG_MAX_BYTES=10485760
LOG_BACKUP_COUNT=10
```

### 6. 创建使用指南
**文件**: `backend/LOG_GUIDE.md`

详细的日志系统使用指南：
- 配置方法
- 使用示例
- 日志格式说明
- 生产环境建议
- 故障排查

### 7. 创建部署指南
**文件**: `backend/DEPLOYMENT_GUIDE.md`

部署和运维指南：
- 快速开始步骤
- 系统架构说明
- 生产环境配置建议
- 监控和告警方案
- 故障排查指南

## 📁 新增/修改的文件

```
backend/
├── core/
│   ├── logger.py                    ✨ 新建 - 日志配置模块
│   ├── database.py                  ✏️ 修改 - 更新logger使用
│   └── ...
├── config/
│   ├── settings.py                  ✏️ 修改 - 添加日志配置参数
│   └── ...
├── services/
│   ├── ocr/service.py               ✏️ 修改 - 更新logger使用
│   ├── search/service.py            ✏️ 修改 - 更新logger使用
│   ├── users/service.py             ✏️ 修改 - 添加logger
│   ├── upload_book/service.py       ✏️ 修改 - 更新logger使用
│   └── ...
├── main.py                          ✏️ 修改 - 初始化新日志系统
├── LOG_GUIDE.md                     📖 新建 - 使用指南
├── DEPLOYMENT_GUIDE.md              📖 新建 - 部署指南
├── .env.example                     📖 新建 - 配置示例
└── ...
```

## 🚀 快速开始

### 1. 验证更新
```bash
# 进入后端目录
cd backend

# 确保主要文件已更新
ls -l core/logger.py LOG_GUIDE.md DEPLOYMENT_GUIDE.md
```

### 2. 配置日志
编辑 `.env` 文件（如已存在），添加日志级别配置：
```env
LOG_LEVEL=INFO                # 或 DEBUG/WARNING/ERROR
LOG_MAX_BYTES=10485760        # 10MB
LOG_BACKUP_COUNT=10           # 保留10个备份
```

### 3. 启动应用
```bash
# 方式1: 直接运行
python main.py

# 方式2: 使用uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000

# 方式3: 后台运行（Linux/Mac）
nohup python main.py > /dev/null 2>&1 &
```

### 4. 查看日志
```bash
# 查看实时日志
tail -f logs/WenXinClassics\ Backend.log

# 查看错误日志
tail -f logs/WenXinClassics\ Backend_error.log

# 搜索特定信息
grep "OCR" logs/WenXinClassics\ Backend.log
```

## 📊 日志存储位置

应用启动后，日志会自动保存到 `backend/logs/` 目录：

```
backend/logs/
├── WenXinClassics Backend.log          # 所有日志
├── WenXinClassics Backend_error.log    # 仅错误日志  
├── WenXinClassics Backend.log.1        # 轮转备份
├── WenXinClassics Backend.log.2
└── ...
```

## 🔧 主要特性

### ✅ 双输出源
- **文件输出**: 完整的日志持久化
- **控制台输出**: 开发时实时查看

### ✅ 日志级别支持
- DEBUG: 详细调试信息
- INFO: 应用流程信息
- WARNING: 警告信息
- ERROR: 错误信息
- CRITICAL: 严重错误

### ✅ 自动轮转
- 当文件达到10MB时自动备份
- 自动保留最近10个备份
- 旧备份自动删除

### ✅ 错误日志隔离
- 所有日志写入主日志文件
- ERROR及以上级别另写入错误日志
- 便于快速定位问题

### ✅ 格式化输出
```
[2026-03-26 10:30:45] [INFO] [main:70] lifespan() - 初始化始...
[时间] [级别] [模块:行号] 函数名() - 消息
```

## 🎯 使用示例

### 在任何模块中添加日志

```python
from core.logger import get_logger

logger = get_logger(__name__)

# 不同级别的日志
logger.debug("调试信息: user_id=123")
logger.info("用户登录: username=admin")
logger.warning("API速率限制: 15/16 请求")
logger.error("数据库连接失败", exc_info=True)
logger.critical("服务不可用")
```

### OCR服务中的日志

```python
logger.info(f"开始OCR识别: {file_path}")
try:
    result = ocr_service.recognize(image)
    logger.info(f"OCR识别完成，检测到{len(result)}个文本块")
except Exception as e:
    logger.error(f"OCR识别失败: {str(e)}", exc_info=True)
    raise
```

### 数据库操作中的日志

```python
logger.info(f"查询用户: user_id={user_id}")
user = db_manager.get_user(user_id)
if user:
    logger.info(f"用户查询成功: username={user.username}")
else:
    logger.warning(f"用户不存在: user_id={user_id}")
```

## 🔍 故障排查

### 问题: 看不到日志文件
**解决方案**:
1. 检查应用是否成功启动
2. 查看 `backend/logs/` 目录是否存在
3. 检查文件系统写入权限
4. 查看控制台错误输出

### 问题: 日志文件过大
**解决方案**:
1. 调整 `LOG_LEVEL` 到更高级别（WARNING/ERROR）
2. 减少 `LOG_MAX_BYTES` 以更频繁轮转
3. 减少 `LOG_BACKUP_COUNT` 来删除更多备份

### 问题: 找不到特定错误
**解决方案**:
```bash
# 搜索特定关键词
grep "错误" backend/logs/WenXinClassics\ Backend_error.log

# 按时间范围搜索
grep "2026-03-26 1[0-2]:" backend/logs/WenXinClassics\ Backend.log

# 实时跟踪日志
tail -f backend/logs/WenXinClassics\ Backend.log | grep ERROR
```

## 📚 相关文档

- **[LOG_GUIDE.md](./LOG_GUIDE.md)** - 详细的日志系统使用指南
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 生产环境部署指南
- **.env.example** - 配置示例和说明

## 🌟 生产环境建议

1. **设置适当的日志级别**
   ```env
   LOG_LEVEL=WARNING  # 减少日志输出
   ```

2. **定期清理旧日志**
   ```bash
   # Linux cron任务: 每天凌晨2点清理30天前的备份
   0 2 * * * find /path/to/backend/logs -name "*.log.*" -mtime +30 -delete
   ```

3. **集成日志聚合系统**
   - 可集成ELK Stack
   - 可集成Splunk
   - 可集成阿里云日志服务

4. **设置监控告警**
   - 监控ERROR日志
   - 设置关键字告警
   - 配置邮件/短信通知

## ✨ 优势总结

| 方面 | 之前 | 之后 |
|------|------|------|
| 日志存储 | 仅控制台 | 文件 + 控制台 |
| 后台运行 | 日志丢失 | 所有日志保存 |
| 文件管理 | 手动清理 | 自动轮转 |
| 错误追踪 | 全部混在一起 | 单独的错误日志 |
| 日志级别 | 只有INFO | 5个级别 |
| 格式化 | 简单 | 详细的时间、位置信息 |

## 🎓 下一步

1. **立即部署**
   - 更新生产环境代码
   - 配置日志参数
   - 启动应用验证

2. **设置监控**
   - 配置日志告警
   - 集成监控系统
   - 定期检查日志

3. **持续改进**
   - 根据需要调整日志级别
   - 添加更多关键操作的日志
   - 集成高级日志分析工具

---

**创建时间**: 2026-03-26  
**版本**: 1.0  
**作者**: GitHub Copilot
