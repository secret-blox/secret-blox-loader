#!/usr/bin/env python
import asyncio
import websockets

async def listen_for_messages(websocket):
    async for message in websocket:
        print(f"Received: {message}")

async def hello():
    async with websockets.connect("ws://localhost:49152") as websocket:
        await websocket.send("Hello world!")
        await listen_for_messages(websocket)

try:
    asyncio.run(hello())
except Exception as e:
    print(f"Connection lost: {e}")
