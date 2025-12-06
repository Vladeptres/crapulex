#!/usr/bin/env python
"""
Django ASGI server startup script that supports WebSocket connections.
"""

import os
import sys
import subprocess

def main():
    """Run Django ASGI server with Daphne for WebSocket support."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings")
    
    # Get port from environment variable, default to 8000 if not set
    port = os.environ.get("API_PORT", "8000")
    
    print(f"Starting Django ASGI server with Daphne on port {port}...")
    print("WebSocket support enabled for real-time features")
    
    try:
        # Use Daphne ASGI server for WebSocket support
        subprocess.run([
            sys.executable, "-m", "daphne",
            "-b", "0.0.0.0",
            "-p", port,
            "api.asgi:application"
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error starting Daphne server: {e}")
        print("Falling back to Django development server (no WebSocket support)...")
        
        # Fallback to Django runserver if Daphne fails
        sys.argv = ["manage.py", "runserver", f"0.0.0.0:{port}"]
        
        try:
            from django.core.management import execute_from_command_line
            execute_from_command_line(sys.argv)
        except ImportError as exc:
            raise ImportError(
                "Couldn't import Django. Are you sure it's installed and "
                "available on your PYTHONPATH environment variable? Did you "
                "forget to activate a virtual environment?",
            ) from exc
    except FileNotFoundError:
        print("Daphne not found. Installing Daphne for WebSocket support...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "daphne"], check=True)
            print("Daphne installed successfully. Restarting server...")
            subprocess.run([
                sys.executable, "-m", "daphne",
                "-b", "0.0.0.0",
                "-p", port,
                "api.asgi:application"
            ], check=True)
        except Exception as install_error:
            print(f"Failed to install or run Daphne: {install_error}")
            print("Please install Daphne manually: pip install daphne")
            sys.exit(1)

if __name__ == "__main__":
    main()
