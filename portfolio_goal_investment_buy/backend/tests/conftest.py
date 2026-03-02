"""
Root-level conftest.py — adds the project root to sys.path so that
'import services', 'import utils', 'import routers' all work without
needing PYTHONPATH=. on the command line.
"""
import sys
import os

# Insert the project root (the folder containing this file) at the front
# of sys.path so pytest can resolve 'services', 'utils', 'routers', etc.
sys.path.insert(0, os.path.dirname(__file__))
