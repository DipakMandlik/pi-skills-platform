from __future__ import annotations

import tempfile
from pathlib import Path

try:
    import _pytest.pathlib as _pytest_pathlib
    import _pytest.tmpdir as _pytest_tmpdir

    _original_cleanup_dead_symlinks = _pytest_tmpdir.cleanup_dead_symlinks
    _original_getbasetemp = _pytest_tmpdir.TempPathFactory.getbasetemp

    def _safe_make_numbered_dir(root, prefix, mode=0o700):
        directory = Path(tempfile.mkdtemp(prefix=prefix, dir=str(root)))
        try:
            directory.chmod(mode)
        except OSError:
            pass
        return directory

    def _safe_cleanup_dead_symlinks(root):
        try:
            return _original_cleanup_dead_symlinks(root)
        except PermissionError:
            return None

    def _safe_getbasetemp(self):
        if self._basetemp is not None:
            return self._basetemp

        if self._given_basetemp is not None:
            return _original_getbasetemp(self)

        project_temp_root = Path.cwd() / "results" / "pytest-root"
        project_temp_root.mkdir(parents=True, exist_ok=True)
        self._basetemp = Path(
            tempfile.mkdtemp(prefix="pytest-", dir=str(project_temp_root))
        ).resolve()
        return self._basetemp

    _pytest_tmpdir.cleanup_dead_symlinks = _safe_cleanup_dead_symlinks
    _pytest_tmpdir.TempPathFactory.getbasetemp = _safe_getbasetemp
    _pytest_tmpdir.make_numbered_dir = _safe_make_numbered_dir
    _pytest_pathlib.make_numbered_dir = _safe_make_numbered_dir
except Exception:
    pass
