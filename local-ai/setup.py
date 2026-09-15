"""Explicit one-time installer. Run with an installed arm64 Python 3.13."""
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import venv

ROOT = Path.home() / 'Library/Application Support/MappAI/local-ai'
MODELS = {'BAAI/bge-m3': '5617a9f61b028005a4858fdac845db406aefb181',
          'BAAI/bge-reranker-v2-m3': '953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e',
          'intfloat/multilingual-e5-base': 'd128750597153bb5987e10b1c3493a34e5a4502a'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--download-only', action='store_true')
    p.add_argument('--device', choices=['mps', 'cpu'], default='mps')
    args = p.parse_args()
    root = args.root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    if not args.download_only:
        if platform.machine() != 'arm64' or sys.version_info[:2] != (3, 13):
            p.error('Use an arm64 Python 3.13 installation (not system Python).')
        env = root / 'runtime'
        venv.EnvBuilder(with_pip=True).create(env)
        python = env / 'bin/python3'
        subprocess.run([str(python), '-m', 'pip', 'install', '--no-cache-dir', '-r', str(Path(__file__).with_name('requirements.txt'))], check=True)
        subprocess.run([str(python), __file__, '--root', str(root), '--download-only', '--device', args.device], check=True)
        return
    from huggingface_hub import HfApi, snapshot_download
    api = HfApi()
    models = {}
    for model in MODELS:
        info = api.model_info(model, revision=MODELS[model], files_metadata=True)
        patterns = ['*.json', '*.txt', '*.model', '*.safetensors', 'pytorch_model.bin', 'README.md', 'LICENSE*']
        import fnmatch
        files = [f for f in info.siblings if '/' not in f.rfilename or f.rfilename.startswith('1_Pooling/')]
        files = [f for f in files if any(fnmatch.fnmatch(f.rfilename, pat) for pat in patterns)]
        if any(f.rfilename.endswith('.safetensors') for f in files):
            files = [f for f in files if f.rfilename != 'pytorch_model.bin']
        size = sum(f.size or 0 for f in files)
        print(f'{model} @ {info.sha}: {size:,} bytes (progress below)', flush=True)
        folder = snapshot_download(model, revision=info.sha, cache_dir=str(root / 'models'), allow_patterns=[f.rfilename for f in files])
        models[model] = {'revision': info.sha, 'path': folder, 'bytes': size}
    config = {'python': sys.executable, 'models': models, 'embedding': 'BAAI/bge-m3', 'reranker': 'BAAI/bge-reranker-v2-m3', 'device': args.device, 'batch': 4, 'chunkTokens': 320, 'pairTokens': 1024}
    target = root / 'config.json'
    tmp = target.with_suffix('.tmp')
    tmp.write_text(json.dumps(config, indent=2) + '\n')
    os.replace(tmp, target)
    print(f'Ready: {target}', flush=True)

if __name__ == '__main__':
    main()
