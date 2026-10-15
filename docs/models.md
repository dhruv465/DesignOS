# Local text and visual-meaning search

Text recognition uses Apple Vision on your Mac. Enable it or recognize existing images in **Settings → AI tools**. First use may take longer while macOS prepares its recognition model.

Visual-meaning search is optional. Choose **Download model** in **Settings → AI tools** to download about **204 MiB** of model files from Hugging Face. Downloads verify file sizes and SHA-256 checksums. Subsequent indexing and queries run locally on your Mac; images and queries are not sent to a model service.

The model is Google's SigLIP base model, converted to quantized ONNX by Xenova. It ranks visual similarity; scores are not factual descriptions or confidence probabilities. Removing model files does not delete library references. Ordinary text search works without this optional model.

- [Original model](https://huggingface.co/google/siglip-base-patch16-224)
- [ONNX conversion](https://huggingface.co/Xenova/siglip-base-patch16-224)
- [Apache-2.0 license](../resources/licenses/SigLIP-APACHE-2.0.txt)

The model requires an internet connection to download. Once downloaded, indexing and search can work offline. Performance and match quality vary with hardware, query language and image content.
