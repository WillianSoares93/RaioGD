@echo off
echo === Instalando PyInstaller ===
py -m pip install --upgrade pyinstaller pystray pillow truststore || goto erro
echo === Gerando Raio.exe ===
py -m PyInstaller --noconsole --onefile --hidden-import pystray._win32 --hidden-import truststore --name Raio --icon raio.ico --version-file version_info.txt raio.py || goto erro
echo === Empacotando a extensao (zip para a loja) ===
py tools\empacotar_extensao.py || goto erro
set ISCC="%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist %ISCC% goto semInno
echo === Gerando instalador ===
%ISCC% installer.iss || goto erro
echo.
echo PRONTO: installer\Raio-Setup.exe
pause
exit /b 0
:semInno
echo.
echo Raio.exe gerado em dist\Raio.exe
echo Para criar o instalador, instale o Inno Setup 6 e rode este arquivo de novo:
echo https://jrsoftware.org/isdl.php
pause
exit /b 0
:erro
echo Ocorreu um erro.
pause
exit /b 1
