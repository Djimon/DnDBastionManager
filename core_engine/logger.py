"""
Simple Logger Utility
Schreibt Logs in logs/ Verzeichnis
"""
import logging
import os
from pathlib import Path
from datetime import datetime

def setup_logger(name: str = "app"):
    """
    Erstelle einen Logger der in logs/ schreibt.
    
    Args:
        name: Logger-Name (wird zur Datei: logs/{name}.log)
    
    Returns:
        Logger-Objekt
    """
    logs_dir = Path(__file__).parent.parent / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    log_file = logs_dir / f"{name}.log"
    
    # Erstelle Logger
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    
    # Entferne alte Handler (um Duplikate zu vermeiden)
    logger.handlers.clear()
    
    # File Handler
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
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
    
    return logger
