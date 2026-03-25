#!/bin/bash
# Quick setup script for Code Agent

echo "🚀 Setting up Code Agent..."

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

echo "✓ Bun is installed"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Check for .env file
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file..."
    cp .env.example .env
    echo ""
    echo "⚠️  Please edit .env and add your ANTHROPIC_API_KEY"
    echo "   You can get one from: https://console.anthropic.com/"
    echo ""
    read -p "Press Enter to open .env in editor..."
    ${EDITOR:-nano} .env
fi

# Test run
echo ""
echo "🧪 Testing installation..."
if grep -q "your_anthropic_api_key_here" .env; then
    echo "⚠️  API key not configured yet"
    echo "   Please add your key to .env and run: bun run dev \"Say hello\""
else
    echo "✓ API key configured"
    echo ""
    echo "🎉 Setup complete! Try running:"
    echo "   bun run dev \"Create a test.txt file with hello world\""
fi
