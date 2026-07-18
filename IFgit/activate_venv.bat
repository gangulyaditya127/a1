@echo off
echo Switching to VENV directory...

cd /d C:/Users/2824693/Documents/pythonflask/venv/Scripts
call activate
if errorlevel 1 echo Couldn't activate VENV...

cd /d C:/Users/2824693/Documents/SonarQube_Task/are_issueforecaster_container
echo VENV Activated!!!

echo.
set /p answer=Open VS Code? [Y/N]: 

if /i "%answer%"=="Y" (
    echo Opening VS Code...
    call code .
) else if /i "%answer%"=="N" (
    echo Not opening VS Code...
) else (
    echo Incorrect answer, not opening VS Code.
)

cmd /k