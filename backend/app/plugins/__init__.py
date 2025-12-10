"""Plugin system for KVCloud.

Plugins are drop-in extensions that can add new functionality to KVCloud.
Each plugin should inherit from BasePlugin and implement required methods.
"""
from app.plugins.base import BasePlugin, PluginManager

__all__ = ["BasePlugin", "PluginManager"]
