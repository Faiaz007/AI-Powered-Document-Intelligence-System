"""Tests for Celery worker tasks."""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Worker tests require Redis and Celery to be running.
# These are integration tests that verify the task can be imported and configured.


def test_celery_app_importable():
    """Celery app should be importable."""
    from app.workers.celery_app import celery_app
    assert celery_app is not None
    assert celery_app.conf.broker_url == "redis://localhost:6379/0"


def test_task_importable():
    """Process document task should be importable."""
    from app.workers.tasks import process_document_task
    assert process_document_task is not None
    assert callable(process_document_task)


def test_task_has_correct_name():
    """Task should have the correct registered name."""
    from app.workers.tasks import process_document_task
    assert process_document_task.name == "app.workers.tasks.process_document_task"