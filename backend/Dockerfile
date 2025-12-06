# Use Python 3.9
FROM python:3.9

# Set the working directory inside the container
WORKDIR /app

# Copy requirements first (better caching)
COPY requirements.txt .

# Install dependencies
# We use --no-cache-dir to keep the image small
RUN pip install --no-cache-dir -r requirements.txt

# --- NEW: Download the spaCy model ---
# This is required for the keyword rescue logic in main.py
RUN python -m spacy download en_core_web_sm

# Copy the rest of the application code
COPY . .

# Create a non-root user (Mandatory for Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

# Run the application on port 7860
# Hugging Face Spaces specifically listens to port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]