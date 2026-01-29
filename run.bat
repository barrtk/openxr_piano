@echo off
title VR Piano Bridge + ngrok Helper
echo -----------------------------------------
echo [1/3] Uruchamianie Bridge (127.0.0.1:8000)...
start "Bridge Server" cmd /k "python mini-bridge.py"

echo [2/3] Uruchamianie ngrok (HTTPS Tunnel)...
start "ngrok Tunnel" cmd /k "ngrok http 127.0.0.1:8000"

echo [3/3] Czekam na wygenerowanie adresu HTTPS...
echo (Moze to potrwac do 10 sekund)
timeout /t 8 >nul

echo -----------------------------------------
echo TWOJ ADRES DO WPISANIA W GOGLACH:
powershell -Command "$resp = Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing -ErrorAction SilentlyContinue; if ($resp) { $json = $resp.Content | ConvertFrom-Json; $url = $json.tunnels[0].public_url; if ($url) { Write-Host '>>> ' -NoNewline; Write-Host $url -ForegroundColor Cyan } else { Write-Host 'Blad: ngrok nie podal adresu. Sprawdz okno ngrok.' -ForegroundColor Red } } else { Write-Host 'Blad: Nie udalo sie polaczyc z API ngrok. Upewnij sie, ze okno ngrok jest otwarte.' -ForegroundColor Red }"
echo -----------------------------------------
echo 1. Przepisz powyższy adres (https://...) do gogli.
echo 2. W goglach kliknij "Visit Site" na stronie ostrzezenia.
echo -----------------------------------------
pause
