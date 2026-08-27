package com.ronnielynch.luna;

/**
 * A short, hand-picked list of small, phone-friendly GGUF models with direct download URLs
 * (Hugging Face), shown in Settings so someone without their own model file doesn't have to go
 * find one manually first. All Q4_K_M quantizations - a solid size/quality middle ground for a
 * phone. Sizes are exact as of when this list was put together (checked against each URL's
 * real Content-Length) but a repo could still rename or remove a file later - downloadModel()
 * in MainActivity treats a failed download as a normal, reportable error either way, not a crash.
 */
public class ModelCatalog {

    public static class Entry {
        public final String name;
        public final String description;
        public final String url;
        public final long approxBytes;

        Entry(String name, String description, String url, long approxBytes) {
            this.name = name;
            this.description = description;
            this.url = url;
            this.approxBytes = approxBytes;
        }
    }

    public static final Entry[] ENTRIES = {
            new Entry("Qwen2.5 1.5B Instruct",
                    "Smallest, fastest pick here - a good first try, especially on an older or lower-RAM phone.",
                    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
                    1_117_320_736L),
            new Entry("Gemma 2 2B Instruct",
                    "Google's small model - a good balance of size and answer quality.",
                    "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf",
                    1_708_582_752L),
            new Entry("Llama 3.2 3B Instruct",
                    "Meta's small model - solid general-purpose quality, still phone-sized.",
                    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                    2_019_377_696L),
            new Entry("Qwen2.5 3B Instruct",
                    "A step up from the 1.5B pick above, if your phone can handle a bit more.",
                    "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
                    2_104_932_768L),
    };
}
