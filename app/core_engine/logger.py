"""
Simple Logger Utility
Schreibt Logs in data/logs/ Verzeichnis
"""
import logging
import os
from pathlib import Path
from datetime import datetime

_initialized_loggers = set()

def setup_logger(name: str = "app"):
    """
    Erstelle einen Logger der in data/logs/ schreibt.
    
    Args:
        name: Logger-Name (wird zur Datei: data/logs/{name}.log)
    
    Returns:
        Logger-Objekt
    """
    logs_dir = Path(__file__).resolve().parents[2] / "data" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    log_file = logs_dir / f"{name}.log"
    
    # Erstelle Logger
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    
    # Entferne alte Handler (um Duplikate zu vermeiden)
    logger.handlers.clear()
    
    # File Handler
    file_mode = 'w' if name not in _initialized_loggers else 'a'
    file_handler = logging.FileHandler(log_file, mode=file_mode, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    
    # Console Handler (für schnelle Übersicht)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    _initialized_loggers.add(name)
    
    return logger
