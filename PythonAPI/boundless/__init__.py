"""boundless: the former name of the valdrada package (Valdrada, formerly BoundlessNYC, a NYC digital twin).

Scripts written for boundless keep working: this package imports valdrada, maps the old submodule names onto the new
ones (boundless.util, boundless.png, ...) and keeps the old error class name, BoundlessError. Import valdrada instead.
"""
import importlib as _importlib
import sys as _sys
import warnings as _warnings

_warnings.warn("the boundless package is now valdrada (Valdrada, formerly BoundlessNYC); import valdrada instead",
               FutureWarning, stacklevel=2)

from valdrada import *  # noqa: E402,F401,F403
from valdrada import __all__ as _all, __version__, ValdradaError  # noqa: E402,F401

BoundlessError = ValdradaError
__all__ = list(_all) + ["BoundlessError"]

for _m in ("actors", "client", "geometry", "png", "sensor_data", "transport", "util", "world",):
    _sys.modules[__name__ + "." + _m] = _importlib.import_module("valdrada." + _m)
    globals()[_m] = _sys.modules[__name__ + "." + _m]
