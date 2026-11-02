"""Build a separate pinned evaluation image; never changes the deployed browser image setting.

Run from claude: python infra/modal/gateway_evaluation_image.py
Pass the printed image ID only to an explicit ModalSandboxRuntime evaluationPolicy invocation.
"""
import pathlib
import modal

ROOT = pathlib.Path(__file__).resolve().parents[2]
image = modal.Image.from_dockerfile(
    ROOT / "apps/browser/gateway/Dockerfile", context_dir=ROOT,
).dockerfile_commands(["ENTRYPOINT []"])

if __name__ == "__main__":
    app = modal.App.lookup("oddhound-browser", create_if_missing=True)
    with modal.enable_output():
        built = image.build(app)
    print(f"ODDHOUND_EVALUATION_IMAGE_ID={built.object_id}")
