import { useEffect, useRef, useLayoutEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { MENU_ITEMS } from "@/constants";
import { actionItemClick } from "../../slices/menuSlice";
import { socket } from "@/socket";
import Image from "next/image";

export default function Board() {
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const drawHistory = useRef([]);
  const historyPointer = useRef(0);
  const shouldDraw = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);

  const { activeMenuItem, actionMenuItem } = useSelector((state) => state.menu);
  const { color, size } = useSelector((state) => state.tool[activeMenuItem]);

  // Improved drawing with smoother lines using Bezier curves
  const drawSmoothLine = (context, x1, y1, x2, y2) => {
    context.beginPath();
    context.moveTo(x1, y1);
    
    // Calculate control points for a smooth curve
    const cp1x = x1 + (x2 - x1) * 0.3;
    const cp1y = y1 + (y2 - y1) * 0.3;
    const cp2x = x1 + (x2 - x1) * 0.7;
    const cp2y = y1 + (y2 - y1) * 0.7;
    
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    context.stroke();
  };

  // Optimize canvas setup for high-resolution displays
  const setupHighResCanvas = (canvas) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Improve line rendering
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    return ctx;
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = setupHighResCanvas(canvas);

    // Download functionality
    if (actionMenuItem === MENU_ITEMS.DOWNLOAD) {
      const URL = canvas.toDataURL('image/png');
      const anchor = document.createElement("a");
      anchor.href = URL;
      anchor.download = "drawing.png";
      anchor.click();
    } 
    // Undo/Redo functionality with improved state management
    else if (
      actionMenuItem === MENU_ITEMS.UNDO ||
      actionMenuItem === MENU_ITEMS.REDO
    ) {
      const newPointer = actionMenuItem === MENU_ITEMS.UNDO 
        ? Math.max(0, historyPointer.current - 1)
        : Math.min(drawHistory.current.length - 1, historyPointer.current + 1);
      
      historyPointer.current = newPointer;
      const imageData = drawHistory.current[newPointer];
      context.putImageData(imageData, 0, 0);
    }
    
    dispatch(actionItemClick(null));
  }, [actionMenuItem, dispatch]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const changeConfig = (color, size) => {
      context.strokeStyle = color;
      context.lineWidth = size;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    };

    changeConfig(color, size);
    
    // Socket configuration handling
    const handleChangeConfig = (config) => {
      changeConfig(config.color, config.size);
    };
    
    socket.on("changeConfig", handleChangeConfig);

    return () => {
      socket.off("changeConfig", handleChangeConfig);
    };
  }, [color, size]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    // Responsive canvas sizing
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleDrawStart = (e) => {
      const pos = e.touches ? e.touches[0] : e;
      shouldDraw.current = true;
      lastPos.current = { x: pos.clientX, y: pos.clientY };
      setIsDrawing(true);
      
      context.beginPath();
      context.moveTo(pos.clientX, pos.clientY);
      
      socket.emit("beginPath", { x: pos.clientX, y: pos.clientY });
    };

    const handleDrawMove = (e) => {
      if (!shouldDraw.current) return;
      
      const pos = e.touches ? e.touches[0] : e;
      drawSmoothLine(
        context, 
        lastPos.current.x, 
        lastPos.current.y, 
        pos.clientX, 
        pos.clientY
      );
      
      lastPos.current = { x: pos.clientX, y: pos.clientY };
      
      socket.emit("drawLine", { 
        x: pos.clientX, 
        y: pos.clientY 
      });
    };

    const handleDrawEnd = () => {
      if (!shouldDraw.current) return;
      
      shouldDraw.current = false;
      setIsDrawing(false);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      drawHistory.current.push(imageData);
      historyPointer.current = drawHistory.current.length - 1;
    };

    // Event listeners for mouse and touch
    canvas.addEventListener("mousedown", handleDrawStart);
    canvas.addEventListener("mousemove", handleDrawMove);
    canvas.addEventListener("mouseup", handleDrawEnd);
    canvas.addEventListener("mouseout", handleDrawEnd);
    
    canvas.addEventListener("touchstart", handleDrawStart);
    canvas.addEventListener("touchmove", handleDrawMove);
    canvas.addEventListener("touchend", handleDrawEnd);

    // Socket event listeners
    socket.on("beginPath", (path) => {
      context.beginPath();
      context.moveTo(path.x, path.y);
    });

    socket.on("drawLine", (path) => {
      context.lineTo(path.x, path.y);
      context.stroke();
    });

    return () => {
      // Cleanup event listeners
      canvas.removeEventListener("mousedown", handleDrawStart);
      canvas.removeEventListener("mousemove", handleDrawMove);
      canvas.removeEventListener("mouseup", handleDrawEnd);
      canvas.removeEventListener("mouseout", handleDrawEnd);
      
      canvas.removeEventListener("touchstart", handleDrawStart);
      canvas.removeEventListener("touchmove", handleDrawMove);
      canvas.removeEventListener("touchend", handleDrawEnd);
      
      window.removeEventListener('resize', resizeCanvas);

      socket.off("beginPath");
      socket.off("drawLine");
    };
  }, []);

  return (
    <>
      <Image
        className='hidden absolute md:block'
        src='https://i.ibb.co/bXwBtPh/download-removebg-preview.png'
        width={120}
        height={50}
        alt='Logo'
        priority
      />
      <canvas 
        ref={canvasRef} 
        style={{
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%',
          cursor: isDrawing ? 'grabbing' : 'grab'
        }}
      />
    </>
  );
}