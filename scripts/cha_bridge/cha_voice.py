"""Mock voice I/O for ChaBridge P0."""


def speak(text: str) -> None:
    """Print a mock TTS line."""
    print("[TTS mock] " + text)


def listen_once() -> str:
    """Read one line of user input."""
    return input("> ")

