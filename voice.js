import { HeadTTS } from "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/+esm";

let headtts = null;
let isReady = false;
let isLoading = false;
let currentAudio = null;

async function ensureVoiceReady() {
  if (isReady) return headtts;
  if (isLoading) {
    while (!isReady) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return headtts;
  }

  isLoading = true;

  headtts = new HeadTTS({
    endpoints: ["webgpu", "wasm"],
    languages: ["en-us"],
    voices: ["af_bella"],
    workerModule: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/modules/worker-tts.mjs",
    dictionaryURL: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/dictionaries/"
  });

  await headtts.connect();

  headtts.setup({
    voice: "af_bella",
    language: "en-us",
    speed: 1,
    audioEncoding: "wav"
  });

  isReady = true;
  isLoading = false;

  return headtts;
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

async function speak(text) {
  if (!text || !text.trim()) return;

  const shortText = text.trim().split("\n").slice(0, 2).join(" ").slice(0, 220);

  try {
    stopAudio();

    const tts = await ensureVoiceReady();
    const messages = await tts.synthesize({
      input: shortText
    });

    let wavBlob = null;

    for (const msg of messages) {
      if (msg instanceof ArrayBuffer) {
        wavBlob = new Blob([msg], { type: "audio/wav" });
        break;
      }

      if (msg?.data?.audio && typeof msg.data.audio === "string") {
        const bytes = base64ToUint8Array(msg.data.audio);
        wavBlob = new Blob([bytes], { type: "audio/wav" });
        break;
      }
    }

    if (!wavBlob) {
      throw new Error("No audio returned from HeadTTS");
    }

    const audioUrl = URL.createObjectURL(wavBlob);
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
    await currentAudio.play();
  } catch (error) {
    console.error("Free voice failed:", error);
    throw error;
  }
}

window.freeVoice = {
  speak,
  stop: stopAudio
};