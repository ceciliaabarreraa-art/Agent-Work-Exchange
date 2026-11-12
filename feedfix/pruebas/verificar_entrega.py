#!/usr/bin/env python3
"""Verifica SHA256SUMS y, si está presente, el ZIP. No requiere paquetes ni red.
El manifiesto no puede contener su propio hash ni el del ZIP que lo contiene.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, re, sys, zipfile

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = 'SHA256SUMS.txt'
ZIP = 'Entrega_iteracion_4.zip'
EXCLUDED_DIRS = {'__pycache__', '.pytest_cache', 'node_modules', '.git'}

def digest(data): return hashlib.sha256(data).hexdigest()
def fail(msg): raise RuntimeError(msg)
def parse_manifest(raw):
    checks = {}
    for line in raw.decode('utf-8').splitlines():
        m = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        if not m: fail('línea inválida del manifiesto')
        h, name = m.groups()
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or name in checks or name in {MANIFEST, ZIP}:
            fail('ruta insegura, duplicada o excluida en manifiesto: '+name)
        checks[name] = h
    return checks

def files(root):
    out = set()
    for p in root.rglob('*'):
        if any(x in EXCLUDED_DIRS for x in p.parts): continue
        if p.is_symlink(): fail('no se permiten enlaces simbólicos: '+str(p))
        if p.is_file():
            rel = p.relative_to(root).as_posix()
            if rel not in {MANIFEST, ZIP}: out.add(rel)
    return out

def verify_directory(checks):
    actual=files(ROOT); expected=set(checks)
    if actual != expected: fail('archivos faltantes: '+str(sorted(expected-actual))+'; extras: '+str(sorted(actual-expected)))
    bad=[n for n,h in checks.items() if digest((ROOT/n).read_bytes()) != h]
    if bad: fail('hashes inválidos en carpeta: '+str(bad))
    print(f'CARPETA: {len(checks)}/{len(checks)} SHA-256 coinciden; ningún archivo extra')

def verify_zip(checks, manifest_raw):
    path=ROOT/ZIP
    if not path.exists(): fail('ZIP no encontrado: '+str(path))
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None: fail('CRC de ZIP inválido')
        names=z.namelist()
        if len(names)!=len(set(names)): fail('ZIP contiene rutas duplicadas')
        expected=set(checks)|{MANIFEST}
        if set(names)!=expected: fail('contenido del ZIP no coincide con manifiesto')
        if z.read(MANIFEST)!=manifest_raw: fail('manifiesto del ZIP y de la carpeta difieren')
        bad=[n for n,h in checks.items() if digest(z.read(n))!=h]
        if bad: fail('hashes inválidos en ZIP: '+str(bad))
        print(f'ZIP: CRC OK; {len(checks)}/{len(checks)} SHA-256 coinciden; {len(names)} entradas')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--zip',action='store_true',help='verifica también ZIP junto a la carpeta extraída');args=ap.parse_args()
    raw=(ROOT/MANIFEST).read_bytes();checks=parse_manifest(raw)
    if not checks: fail('manifiesto vacío')
    verify_directory(checks)
    if args.zip: verify_zip(checks,raw)

if __name__=='__main__':
    try: main()
    except Exception as e: print('FALLO:',e,file=sys.stderr);sys.exit(1)
