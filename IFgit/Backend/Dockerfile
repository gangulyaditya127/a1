# Use the exact Python image you already pulled
FROM docker.io/library/python:3.13.5

# -------------------------------------------------
# Environment variables (same as run.bat)
# -------------------------------------------------
ENV FLASK_ENV=production
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=8004

# -------------------------------------------------
# Create non-root user (fixes security warning)
# -------------------------------------------------
RUN useradd -m appuser

# Set working directory
WORKDIR /app

# Ensure directory ownership
RUN chown -R appuser:appuser /app

# -------------------------------------------------
# Install application packages
# -------------------------------------------------
COPY langchain_tcs_bfsi_genai-0.0.5-py3-none-any.whl .
RUN pip install --no-cache-dir langchain_tcs_bfsi_genai-0.0.5-py3-none-any.whl

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# -------------------------------------------------
# Copy application code (uncomment when needed)
# -------------------------------------------------
# COPY . .

# -------------------------------------------------
# Switch to non-root user (important)
# -------------------------------------------------
USER appuser

# Expose app port
EXPOSE 8004

# EXACT equivalent of run.bat
CMD ["flask", "run"]