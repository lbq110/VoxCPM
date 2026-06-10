"""
Generate a library of companion-style voice presets with VoxCPM2 Voice Design,
then freeze each as a reference wav so the server can clone it for a consistent
voice. Run this ON THE POD (GPU). Writes /workspace/voices/<id>.wav + voices.json.
"""

import json
import os
import sys

import soundfile as sf
from voxcpm import VoxCPM

OUT_DIR = os.environ.get("VOICES_DIR", "/workspace/voices")
MODEL = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")

# Tasteful, warm "companion" voices. desc = Voice Design control; sample = a short
# warm line just to audition the timbre.
PRESETS = [
    {
        "id": "m_magnetic", "gender": "male", "label": "磁性宠溺男友音",
        "desc": "一位成年男性，嗓音低沉醇厚，带一点沙哑磁性，语气温柔宠溺，语速放慢，像在耳边轻声说话，充满安全感。",
        "sample": "今天辛苦了，别想太多，有我在呢，过来让我抱抱你。",
    },
    {
        "id": "m_sunny", "gender": "male", "label": "阳光治愈暖男",
        "desc": "一位年轻男性，声音清澈温暖干净，语气温柔有朝气，自然亲切，带着治愈感的微笑。",
        "sample": "嘿，我刚还在想你呢。今天过得怎么样，跟我说说吧。",
    },
    {
        "id": "m_mature", "gender": "male", "label": "沉稳大叔音",
        "desc": "一位成熟男性，嗓音低沉沉稳醇厚，从容自信，语速平缓，温柔而有力量，给人依靠感。",
        "sample": "别担心，慢慢来，无论发生什么，我都会在你身边陪着你。",
    },
    {
        "id": "f_sweet", "gender": "female", "label": "软糯甜妹",
        "desc": "一位年轻女孩，声音软糯香甜，温柔黏人，带一点撒娇的语气，轻快可爱。",
        "sample": "你终于来啦，人家等你好久了呢，今天有没有想我呀？",
    },
    {
        "id": "f_gentle", "gender": "female", "label": "温柔御姐",
        "desc": "一位成熟女性，嗓音低柔慵懒，知性温暖，带一点气声，语速从容，温柔体贴。",
        "sample": "忙了一天累了吧？过来坐下，把头靠过来，我陪你休息一会儿。",
    },
    {
        "id": "f_girlnextdoor", "gender": "female", "label": "邻家温柔女友",
        "desc": "一位年轻女性，声音清甜温柔，亲切自然，语气体贴，带着温暖的笑意。",
        "sample": "我给你留了灯，也留了热饭。回来就好，以后我都在这儿等你。",
    },
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"loading {MODEL} ...", file=sys.stderr, flush=True)
    model = VoxCPM.from_pretrained(MODEL, load_denoiser=False, optimize=False, device="cuda")
    sr = int(model.tts_model.sample_rate)

    manifest = []
    for p in PRESETS:
        text = f"({p['desc']}){p['sample']}"
        print(f"[gen] {p['id']} ...", file=sys.stderr, flush=True)
        wav = model.generate(text=text, cfg_value=2.0, inference_timesteps=12, normalize=True)
        path = os.path.join(OUT_DIR, f"{p['id']}.wav")
        sf.write(path, wav, sr)
        manifest.append({**p, "file": path})
        print(f"[gen] saved {path} ({len(wav)/sr:.1f}s)", file=sys.stderr, flush=True)

    with open(os.path.join(OUT_DIR, "voices.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"DONE wrote {len(manifest)} voices to {OUT_DIR}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
