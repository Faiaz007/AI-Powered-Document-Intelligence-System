"""Test runner script for docintel evaluation.

Run with: python -m eval.run_evaluation
"""

import os
import sys
import subprocess
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_tests():
    """Run all pytest tests in the eval directory."""
    eval_dir = os.path.join(BACKEND_DIR, "eval")
    print("=" * 60)
    print("Running docintel test suite")
    print("=" * 60)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", eval_dir, "-v", "--tb=short"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    print("=" * 60)
    print(f"Exit code: {result.returncode}")
    print("=" * 60)

    return result.returncode


if __name__ == "__main__":
    exit_code = run_tests()
    sys.exit(exit_code)