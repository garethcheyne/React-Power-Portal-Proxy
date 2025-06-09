#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Starting menu..."
node cli.js menu
