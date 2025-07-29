import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Volume2, VolumeX } from 'lucide-react';

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const BIRD_SIZE = 40;
const PIPE_WIDTH = 80;
const PIPE_GAP = 200;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const PIPE_SPEED = 3;

// Character options
const CHARACTERS = [
  { id: 'hippo', name: 'Sudeng', emoji: '🦛', color: 'bg-blue-400' },
  { id: 'pigu', name: 'Pigu', emoji: '🐧', color: 'bg-blue-400' },
  { id: 'blub', name: 'Blub', emoji: '🐟', color: 'bg-blue-400' },
  { id: 'miu', name: 'Miu', emoji: '🐈', color: 'bg-blue-400' }
];

const SuiFlapGame = () => {
  // Wallet connection using dapp-kit
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  
  // Game state
  const [gameState, setGameState] = useState('menu'); // menu, playing, gameOver
  const [selectedCharacter, setSelectedCharacter] = useState(CHARACTERS[0]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [tokensEarned, setTokensEarned] = useState(0);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  
  // Bird state
  const [bird, setBird] = useState({
    x: 100,
    y: GAME_HEIGHT / 2,
    velocity: 0
  });
  
  // Pipes state
  const [pipes, setPipes] = useState([]);
  const [menuPipes, setMenuPipes] = useState([]);
  
  // Game loop
  const gameLoopRef = useRef();
  const menuAnimationRef = useRef();
  const [lastPipeSpawn, setLastPipeSpawn] = useState(0);
  const [lastMenuPipeSpawn, setLastMenuPipeSpawn] = useState(0);
  
  // Audio refs
  const themeSongRef = useRef(null);
  const coinSfxRef = useRef(null);
  const jumpSfxRef = useRef(null);
  const failSfxRef = useRef(null);
  
  // Initialize audio
  useEffect(() => {
    themeSongRef.current = new Audio('/suiflap_themesong.mp3');
    coinSfxRef.current = new Audio('/coin_sfx.mp3');
    jumpSfxRef.current = new Audio('/jump_sfx.mp3');
    failSfxRef.current = new Audio('/fail_sfx.mp3');
    
    // Set theme song to loop
    themeSongRef.current.loop = true;
    themeSongRef.current.volume = 0.5;
    
    // Set volumes for SFX
    coinSfxRef.current.volume = 0.7;
    jumpSfxRef.current.volume = 0.5;
    failSfxRef.current.volume = 0.8;
    
    return () => {
      // Cleanup audio when component unmounts
      if (themeSongRef.current) {
        themeSongRef.current.pause();
        themeSongRef.current = null;
      }
      if (coinSfxRef.current) coinSfxRef.current = null;
      if (jumpSfxRef.current) jumpSfxRef.current = null;
      if (failSfxRef.current) failSfxRef.current = null;
    };
  }, []);
  
  // Play theme song on menu
  // ✅ Mobile height fix
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);
  useEffect(() => {
    if (gameState === 'menu' && themeSongRef.current && isSoundEnabled) {
      themeSongRef.current.play().catch(e => console.log('Audio play failed:', e));
    } else if (themeSongRef.current) {
      themeSongRef.current.pause();
    }
  }, [gameState, isSoundEnabled]);
  
  // Sound toggle function
  const toggleSound = () => {
    setIsSoundEnabled(prev => {
      const newValue = !prev;
      if (!newValue && themeSongRef.current) {
        themeSongRef.current.pause();
      } else if (newValue && gameState === 'menu' && themeSongRef.current) {
        themeSongRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
      return newValue;
    });
  };
  
  // Play sound effect helper
  const playSound = (audioRef) => {
    if (audioRef.current && isSoundEnabled) {
      audioRef.current.currentTime = 0; // Reset to start
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };
  
  
  // Initialize menu pipes
  const initMenuPipes = () => {
    const initialPipes = [];
    const screenHeight = window.innerHeight;
    const groundHeight = 64;
    const availableHeight = screenHeight - groundHeight;
    
    for (let i = 0; i < 5; i++) {
      // Calculate pipe heights properly
      const minTopHeight = 100;
      const maxTopHeight = availableHeight - PIPE_GAP - 100;
      const topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight;
      
      initialPipes.push({
        x: (i * 300) - 100, // Start some pipes off-screen to the left
        topHeight: topHeight,
        bottomY: topHeight + PIPE_GAP,
        scored: false
      });
    }
    setMenuPipes(initialPipes);
    setLastMenuPipeSpawn(Date.now());
  };
  
  // Menu animation loop
  useEffect(() => {
    if (gameState !== 'menu') {
      if (menuAnimationRef.current) {
        clearInterval(menuAnimationRef.current);
      }
      setMenuPipes([]); // Clear menu pipes when not in menu
      return;
    }
    
    // Initialize menu pipes if empty
    if (menuPipes.length === 0) {
      initMenuPipes();
      return; // Wait for next render cycle
    }
    
    const menuLoop = () => {
      setMenuPipes(prev => {
        let newPipes = prev.map(pipe => ({
          ...pipe,
          x: pipe.x - PIPE_SPEED
        })).filter(pipe => pipe.x > -PIPE_WIDTH - 50); // Keep pipes a bit longer for smooth transition
        
        // Spawn new pipe when the rightmost pipe is far enough left
        const rightmostPipe = newPipes.reduce((max, pipe) => 
          pipe.x > max ? pipe.x : max, -1000
        );
        
        if (rightmostPipe < window.innerWidth - 200) {
          const screenHeight = window.innerHeight;
          const groundHeight = 64;
          const availableHeight = screenHeight - groundHeight;
          const minTopHeight = 100;
          const maxTopHeight = availableHeight - PIPE_GAP - 100;
          const topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight;
          
          newPipes.push({
            x: window.innerWidth + 50,
            topHeight: topHeight,
            bottomY: topHeight + PIPE_GAP,
            scored: false
          });
        }
        
        return newPipes;
      });
    };
    // @ts-ignore
    menuAnimationRef.current = setInterval(menuLoop, 1000/60); // 60 FPS
    
    return () => {
      if (menuAnimationRef.current) {
        clearInterval(menuAnimationRef.current);
      }
    };
  }, [gameState, menuPipes.length]);
  
  // Initialize game
  const initGame = () => {
    setBird({ x: 100, y: window.innerHeight / 2, velocity: 0 });
    setPipes([]);
    setScore(0);
    setLastPipeSpawn(0);
  };
  
  // Start game
  const startGame = () => {
    initGame();
    setGameState('playing');
    // Stop theme song when starting game
    if (themeSongRef.current) {
      themeSongRef.current.pause();
    }
  };
  
  // Jump function
  const jump = useCallback(() => {
    if (gameState === 'playing') {
      setBird(prev => ({ ...prev, velocity: JUMP_FORCE }));
      // Play jump sound
      playSound(jumpSfxRef);
    }
  }, [gameState, isSoundEnabled]);
  
  // Mock token minting function (placeholder for actual implementation)
  const mintToken = async () => {
    if (!currentAccount) return;
    
    try {
      // Play coin sound for earning token
      playSound(coinSfxRef);
      
      // This is a placeholder for token minting
      // You would implement actual SUI Move module for token minting here
      // Example transaction structure:
      /*
      const tx = new Transaction();
      
      tx.moveCall({
        target: `${PACKAGE_ID}::game_token::mint_reward`,
        arguments: [
          tx.pure.address(currentAccount.address),
          tx.pure.u64(1) // amount of tokens to mint
        ]
      });
      
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log('Token minted successfully:', result);
            setTokensEarned(prev => prev + 1);
          },
          onError: (error) => {
            console.error('Error minting token:', error);
          }
        }
      );
      */
      
      // For demo purposes, just increment local counter
      setTokensEarned(prev => prev + 1);
      console.log('Token earned for passing pipe!');
      
    } catch (error) {
      console.error('Error with token reward:', error);
    }
  };
  
  // Collision detection function
  const checkCollision = (birdRect, pipes) => {
    for (const pipe of pipes) {
      const topPipeRect = {
        x: pipe.x,
        y: 0,
        width: PIPE_WIDTH,
        height: pipe.topHeight
      };
      
      const bottomPipeRect = {
        x: pipe.x,
        y: pipe.bottomY,
        width: PIPE_WIDTH,
        height: window.innerHeight - pipe.bottomY - 64 // Account for ground
      };
      
      if (
        (birdRect.x < topPipeRect.x + topPipeRect.width &&
         birdRect.x + birdRect.width > topPipeRect.x &&
         birdRect.y < topPipeRect.y + topPipeRect.height &&
         birdRect.y + birdRect.height > topPipeRect.y) ||
        (birdRect.x < bottomPipeRect.x + bottomPipeRect.width &&
         birdRect.x + birdRect.width > bottomPipeRect.x &&
         birdRect.y < bottomPipeRect.y + bottomPipeRect.height &&
         birdRect.y + birdRect.height > bottomPipeRect.y)
      ) {
        return true;
      }
    }
    return false;
  };
  
  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const gameLoop = () => {
      setBird(prev => {
        const newVelocity = prev.velocity + GRAVITY;
        const newY = prev.y + newVelocity;
        
        // Check bounds
        if (newY < 0 || newY > window.innerHeight - BIRD_SIZE - 64) { // Account for ground height
          setGameState('gameOver');
          // Play fail sound
          playSound(failSfxRef);
          if (score > highScore) {
            setHighScore(score);
          }
          return prev;
        }
        
        return { ...prev, y: newY, velocity: newVelocity };
      });
      
      setPipes(prev => {
        let newPipes = prev.map(pipe => ({
          ...pipe,
          x: pipe.x - PIPE_SPEED
        })).filter(pipe => pipe.x > -PIPE_WIDTH);
        
        // Check for scoring and token minting
        newPipes.forEach(pipe => {
          if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x) {
            pipe.scored = true;
            setScore(s => s + 1);
            if (currentAccount) {
              mintToken(); // Mint token for passing pipe
            }
          }
        });
        
        return newPipes;
      });
      
      // Spawn new pipes
      setLastPipeSpawn(prev => {
        if (Date.now() - prev > 2000) { // Spawn every 2 seconds
          const screenHeight = window.innerHeight;
          const groundHeight = 64;
          const availableHeight = screenHeight - groundHeight;
          const minTopHeight = 100;
          const maxTopHeight = availableHeight - PIPE_GAP - 100;
          const topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight;
          
          setPipes(pipes => [...pipes, {
            x: window.innerWidth,
            topHeight: topHeight,
            bottomY: topHeight + PIPE_GAP,
            scored: false
          }]);
          return Date.now();
        }
        return prev;
      });
    };
    // @ts-ignore
    gameLoopRef.current = setInterval(gameLoop, 1000/60); // 60 FPS
    
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameState, bird.x, score, highScore, currentAccount, isSoundEnabled]);
  
  // Collision detection effect
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const birdRect = {
      x: bird.x,
      y: bird.y,
      width: BIRD_SIZE,
      height: BIRD_SIZE
    };
    
    if (checkCollision(birdRect, pipes)) {
      setGameState('gameOver');
      // Play fail sound
      playSound(failSfxRef);
      if (score > highScore) {
        setHighScore(score);
      }
    }
  }, [bird, pipes, gameState, score, highScore, isSoundEnabled]);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gameState === 'menu' || gameState === 'gameOver') {
          startGame();
        } else {
          jump();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, jump]);
  const canvasHandlers = {
    onClick: jump,
    onTouchStart: jump, // ✅ Mobile tap support
  };
  if (gameState === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        {/* Animated Game Background */}
        <div 
          className="absolute inset-0 bg-gradient-to-b from-sky-300 to-green-300"
          style={{ width: '100vw', height: '100vh' }}
        >
          {/* Clouds Background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-10 left-20 w-16 h-8 bg-white rounded-full opacity-70 animate-pulse"></div>
            <div className="absolute top-20 right-32 w-20 h-10 bg-white rounded-full opacity-60 animate-pulse"></div>
            <div className="absolute top-32 left-1/2 w-12 h-6 bg-white rounded-full opacity-80 animate-pulse"></div>
            <div className="absolute top-40 left-1/4 w-14 h-7 bg-white rounded-full opacity-50 animate-pulse"></div>
            <div className="absolute top-60 right-1/4 w-18 h-9 bg-white rounded-full opacity-60 animate-pulse"></div>
            <div className="absolute top-80 left-3/4 w-10 h-5 bg-white rounded-full opacity-70 animate-pulse"></div>
          </div>
          
          {/* Animated Menu Pipes */}
          {menuPipes.map((pipe, index) => (
            <div key={`menu-pipe-${index}`} className="absolute" style={{ zIndex: 1 }}>
              {/* Top Pipe */}
              <div
                className="absolute bg-green-600 border-4 border-green-700 shadow-lg opacity-40"
                style={{
                  left: pipe.x,
                  top: 0,
                  width: PIPE_WIDTH,
                  height: pipe.topHeight,
                  borderRadius: '0 0 8px 8px'
                }}
              />
              {/* Bottom Pipe */}
              <div
                className="absolute bg-green-600 border-4 border-green-700 shadow-lg opacity-40"
                style={{
                  left: pipe.x,
                  top: pipe.bottomY,
                  width: PIPE_WIDTH,
                  height: window.innerHeight - pipe.bottomY - 64, // Subtract ground height (64px)
                  borderRadius: '8px 8px 0 0'
                }}
              />
            </div>
          ))}
          
          {/* Ground */}
          <div className="absolute bottom-0 w-full h-16 bg-gradient-to-t from-yellow-700 to-yellow-500 border-t-4 border-yellow-800"></div>
        </div>
        
        {/* Menu Content */}
        <div className="bg-slate-300 flex flex-col gap-3 backdrop-blur-sm rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 relative z-10">
          <div>
          <div className='flex flex-col items-center mb-4'>
          <img src="/suiflap_logo_2.png" alt="suiflap" width={50} height={50}/>
          <h1 className="text-4xl font-bold text-center mb-2 text-sky-600">SuiFlap</h1>
          </div>
          <p className="text-center text-gray-600 mb-6">Flap your SUI memes!</p>
          </div>
          
          {/* Connect Button and Sound Toggle */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <ConnectButton className="w-full" />
            </div>
            <div className='flex gap-2 flex-row items-center justify-center'>
            <div>
              <p className="text-black bg-white p-2 rounded-xl">0 SLAP</p>
            </div>
            <button
              onClick={toggleSound}
              className={`px-4 py-2 rounded-lg border-2 transition-all hover:scale-105 ${
                isSoundEnabled 
                  ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' 
                  : 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
              }`}
              title={isSoundEnabled ? 'Sound On' : 'Sound Off'}
            >
              {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            </div>
          </div>
          
          {/* Wallet Status */}
          <div className="mb-6 text-center">
            {currentAccount ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700 font-medium">
                  🎮 Wallet Connected!
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Earn tokens by passing pipes!
                </p>
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-700">
                  Connect your wallet to earn tokens!
                </p>
              </div>
            )}
          </div>
          
          {/* Character Selection */}
          <h3 className="text-lg font-semibold mb-4 text-center text-black">Choose Your Character</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {CHARACTERS.map(char => (
              <button
                key={char.id}
                onClick={() => setSelectedCharacter(char)}
                className={`p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                  selectedCharacter.id === char.id 
                    ? 'border-sky-500 bg-sky-50 shadow-md' 
                    : 'border-gray-200 hover:border-sky-300'
                }`}
              >
                <div className="text-2xl mb-1">{char.emoji}</div>
                <div className="text-sm font-medium text-black">{char.name}</div>
              </button>
            ))}
          </div>
          <div className='flex gap-2'>

          <button
            onClick={startGame}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-lg transition-colors transform hover:scale-105 cursor-pointer"
          >
            🚀 Start Game
          </button>
          <button
            onClick={startGame}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-lg transition-colors transform hover:scale-105 cursor-pointer"
          >
            🪙 Mint $SLAP
          </button>
          </div>
          
          {(highScore > 0 || tokensEarned > 0) && (
            <div className="mt-4 text-center space-y-1">
              {highScore > 0 && (
                <p className="text-gray-600">🏆 High Score: {highScore}</p>
              )}
              {tokensEarned > 0 && (
                <p className="text-green-600">🪙 Total Tokens: {tokensEarned}</p>
              )}
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-500 text-center">
            Press SPACE or click to jump • Avoid the pipes!
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div
      className="fixed inset-0 bg-gradient-to-b from-sky-300 to-green-300 overflow-hidden"
      style={{ height: 'calc(var(--vh, 1vh) * 100)' }} // ✅ Full mobile height
    >
      <div
        className="relative w-full h-full cursor-pointer select-none"
        {...canvasHandlers} // ✅ Touch + click
      >
        {/* Clouds Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-20 w-16 h-8 bg-white rounded-full opacity-70 animate-pulse"></div>
          <div className="absolute top-20 right-32 w-20 h-10 bg-white rounded-full opacity-60 animate-pulse"></div>
          <div className="absolute top-32 left-1/2 w-12 h-6 bg-white rounded-full opacity-80 animate-pulse"></div>
          <div className="absolute top-40 left-1/4 w-14 h-7 bg-white rounded-full opacity-50 animate-pulse"></div>
          <div className="absolute top-60 right-1/4 w-18 h-9 bg-white rounded-full opacity-60 animate-pulse"></div>
          <div className="absolute top-80 left-3/4 w-10 h-5 bg-white rounded-full opacity-70 animate-pulse"></div>
        </div>
        
        {/* Bird */}
        <div
          className={`absolute transition-all duration-75 ${selectedCharacter.color} rounded-full flex items-center justify-center text-xl shadow-lg border-2 border-white`}
          style={{
            left: bird.x,
            top: bird.y,
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            transform: `rotate(${Math.min(Math.max(bird.velocity * 3, -30), 45)}deg)`,
            zIndex: 10
          }}
        >
          {selectedCharacter.emoji}
        </div>
        
        {/* Pipes */}
        {pipes.map((pipe, index) => (
          <div key={index}>
            {/* Top Pipe */}
            <div
              className="absolute bg-green-600 border-4 border-green-700 shadow-lg"
              style={{
                left: pipe.x,
                top: 0,
                width: PIPE_WIDTH,
                height: pipe.topHeight,
                borderRadius: '0 0 8px 8px'
              }}
            />
            {/* Bottom Pipe */}
            <div
              className="absolute bg-green-600 border-4 border-green-700 shadow-lg"
              style={{
                left: pipe.x,
                top: pipe.bottomY,
                width: PIPE_WIDTH,
                height: window.innerHeight - pipe.bottomY - 64,
                borderRadius: '8px 8px 0 0'
              }}
            />
          </div>
        ))}
        
        {/* Ground */}
        <div className="absolute bottom-0 w-full h-16 bg-gradient-to-t from-yellow-700 to-yellow-500 border-t-4 border-yellow-800"></div>
      </div>
        
        {/* UI Overlay */}
        <div className="absolute top-4 left-4 text-white z-20">
          <div className="bg-black bg-opacity-70 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-2xl font-bold">Score: {score}</div>
            {currentAccount && (
              <div className="text-sm flex items-center gap-1">
                <span>Tokens: {tokensEarned}</span>
                <span className="text-yellow-400">🪙</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Character indicator */}
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black bg-opacity-70 rounded-lg p-2 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-white">
              <span className="text-lg">{selectedCharacter.emoji}</span>
              <span className="text-sm font-medium">{selectedCharacter.name}</span>
            </div>
          </div>
        </div>
        
        {/* Game Over Screen */}
        {gameState === 'gameOver' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-30">
            <div className="bg-white rounded-lg p-8 text-center max-w-sm mx-4 shadow-2xl">
              <div className="text-6xl mb-4">💥</div>
              <h2 className="text-3xl font-bold mb-4 text-red-600">Game Over!</h2>
              <div className="space-y-2 mb-6">
                <p className="text-lg text-black">Final Score: <span className="font-bold text-sky-600">{score}</span></p>
                <p className="text-lg text-black">High Score: <span className="font-bold text-green-600">{Math.max(score, highScore)}</span></p>
                {currentAccount && tokensEarned > 0 && (
                  <p className="text-md text-green-600 bg-green-50 rounded-lg p-2">
                    🪙 Total Tokens Earned: {tokensEarned}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <button
                  onClick={startGame}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors transform hover:scale-105"
                >
                  🔄 Play Again
                </button>
                <button
                  onClick={() => setGameState('menu')}
                  className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  🏠 Back to Menu
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Instructions */}
        {gameState === 'playing' && (
          <div className="absolute bottom-4 right-4 z-20">
            <div className="bg-black bg-opacity-70 rounded-lg p-2 text-white text-sm backdrop-blur-sm">
              Press SPACE or click to jump
            </div>
          </div>
        )}
    </div>
  );
};

export default SuiFlapGame;