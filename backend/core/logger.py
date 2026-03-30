import logging
import logging.handlers
import os
from pathlib import Path
from typing import Optional


def setup_logging(
    app_name: str = "WenXinClassics",
    log_level: str = "INFO",
    log_dir: Optional[str] = None,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 10,
    log_format: Optional[str] = None,
) -> logging.Logger:
    """
    配置应用程序的日志系统

    Args:
        app_name: 应用名称
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: 日志目录，如果为None则为 backend/logs
        max_bytes: 单个日志文件的最大大小（字节）
        backup_count: 保留的备份日志文件数
        log_format: 自定义日志格式

    Returns:
        配置好的logger对象
    """

    # 设置日志级别
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # 如果没有指定日志目录，默认为 backend/logs
    if log_dir is None:
        log_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "logs"
        )

    # 创建日志目录
    Path(log_dir).mkdir(parents=True, exist_ok=True)

    # 日志格式
    if log_format is None:
        log_format = (
            "[%(asctime)s] [%(levelname)-8s] [%(name)s:%(lineno)d] "
            "%(funcName)s() - %(message)s"
        )

    formatter = logging.Formatter(
        log_format,
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 获取根logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # 清除已有的处理器
    root_logger.handlers.clear()

    # 1. 文件处理器 - 所有日志
    all_log_file = os.path.join(log_dir, f"{app_name}.log")
    file_handler = logging.handlers.RotatingFileHandler(
        all_log_file,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)  # 文件记录所有级别
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # 2. 错误日志处理器 - 仅ERROR及以上
    error_log_file = os.path.join(log_dir, f"{app_name}_error.log")
    error_handler = logging.handlers.RotatingFileHandler(
        error_log_file,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    root_logger.addHandler(error_handler)

    # 3. 控制台处理器 - 开发时查看
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 获取应用logger
    logger = logging.getLogger(app_name)
    logger.info(f"日志系统已初始化 - 日志目录: {log_dir}")
    logger.info(f"日志级别: {log_level}")
    logger.info(f"所有日志文件: {all_log_file}")
    logger.info(f"错误日志文件: {error_log_file}")

    return logger


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的logger

    Args:
        name: logger名称，通常为 __name__

    Returns:
        logger对象
    """
    return logging.getLogger(name)
