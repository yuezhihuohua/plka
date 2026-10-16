"""Maintainer archive writer: preserve Unix execution modes and UTF-8 names."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
paths = [source, *sorted(source.rglob('*'))]
if any(path.is_symlink() for path in paths):
    raise RuntimeError('Distribution must contain regular files, not symlinks')
with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
    for path in paths:
        archive.write(path, path.relative_to(source.parent).as_posix())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    for path in paths:
        name = path.relative_to(source.parent).as_posix() + ('/' if path.is_dir() else '')
        entry = archive.getinfo(name)
        if not name.isascii():
            assert entry.flag_bits & 0x800, 'Missing UTF-8 filename flag: ' + name
        assert ((entry.external_attr >> 16) & 0o777) == (path.stat().st_mode & 0o777), name
print('ZIP verified: UTF-8 filenames, executable modes and CRC.')
