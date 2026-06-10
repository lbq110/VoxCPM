"""
Generate ADDITIONAL voice presets and merge into the existing voices.json.
These are ORIGINAL voices designed for a certain *style/quality* — not clones of
any real, identifiable person. Run on the pod (GPU).
"""

import json
import os
import sys

import soundfile as sf
from voxcpm import VoxCPM

OUT_DIR = os.environ.get("VOICES_DIR", "/workspace/voices")
MODEL = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")

EXTRA = [
    {
        "id": "m_scholar", "gender": "male", "label": "知性书卷男声",
        "desc": "一位中年男性，嗓音温厚醇正，富有书卷气与文化感，语速从容健谈，亲切而有磁性，像在娓娓道来。",
        "sample": "其实啊，生活就像一首歌，急不得。来，坐下喝杯茶，我跟你慢慢聊。",
    },
    {
        "id": "f_sweetdoll", "gender": "female", "label": "温柔甜美娃娃音",
        "desc": "一位年轻女性，声音温柔甜美轻柔，略带娃娃音，亲切优雅，语气柔软体贴。",
        "sample": "你来啦，我好开心呀。今天有没有好好吃饭呀，要照顾好自己哦。",
    },
    {
        "id": "f_sultry", "gender": "female", "label": "成熟慵懒女声",
        "desc": "一位成熟女性，嗓音温暖醇厚，慵懒中带一点韵味，从容自信，温柔有磁性。",
        "sample": "别急着走嘛，难得见一次。陪我多坐一会儿，好不好？",
    },
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(OUT_DIR, "voices.json")
    existing = []
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    by_id = {v["id"]: v for v in existing}

    print(f"loading {MODEL} ...", file=sys.stderr, flush=True)
    model = VoxCPM.from_pretrained(MODEL, load_denoiser=False, optimize=False, device="cuda")
    sr = int(model.tts_model.sample_rate)

    for p in EXTRA:
        text = f"({p['desc']}){p['sample']}"
        print(f"[gen] {p['id']} ...", file=sys.stderr, flush=True)
        wav = model.generate(text=text, cfg_value=2.0, inference_timesteps=12, normalize=True)
        path = os.path.join(OUT_DIR, f"{p['id']}.wav")
        sf.write(path, wav, sr)
        by_id[p["id"]] = {**p, "file": path}
        print(f"[gen] saved {path} ({len(wav)/sr:.1f}s)", file=sys.stderr, flush=True)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(list(by_id.values()), f, ensure_ascii=False, indent=2)
    print(f"DONE total {len(by_id)} voices", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
