"""Register upload files that are not referenced by the asset index.

The command is dry-run by default. Add --write to update the asset file.
"""

import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', default='server/data/assets.json', type=Path)
    parser.add_argument('--uploads', default='data/uploads', type=Path)
    parser.add_argument('--category', default='纹样库')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()

    assets = json.loads(args.assets.read_text(encoding='utf-8'))
    registered = {
        asset.get('image', '').removeprefix('/uploads/')
        for asset in assets
        if asset.get('image', '').startswith('/uploads/')
    }
    files = {item.name for item in args.uploads.iterdir() if item.is_file()}
    unregistered = sorted(files - registered)

    print(f'Registered: {len(registered)}')
    print(f'Total files on disk: {len(files)}')
    print(f'Unregistered: {len(unregistered)}')

    if not args.write:
        print('Dry run only. Add --write to update the asset index.')
        return

    new_assets = [
        {
            'id': f'auto-{Path(name).stem}',
            'title': Path(name).stem[:30],
            'category': args.category,
            'image': f'/uploads/{name}',
            'source': '本地图片导入',
            'capturedAt': '2026-06-22',
            'learned': 1,
            'confidence': 73,
            'tags': [],
            'note': '系统按文件名自动归类，后续可通过学习反馈校正标签。',
        }
        for name in unregistered
    ]
    args.assets.write_text(
        json.dumps(assets + new_assets, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'Added {len(new_assets)} new assets. Total: {len(assets) + len(new_assets)}')


if __name__ == '__main__':
    main()
