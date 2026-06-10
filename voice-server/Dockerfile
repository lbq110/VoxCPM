# Voice server image for RunPod (L40S / any CUDA 12 GPU).
FROM pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/runpod-volume/hf \
    VOICE_DEVICE=cuda \
    DEFAULT_ASR_MODEL=sensevoice-small \
    SENSEVOICE_MODEL=iic/SenseVoiceSmall \
    WHISPER_MODEL=large-v3 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8000
CMD ["python", "server.py"]
