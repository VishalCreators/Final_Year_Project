#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>

#pragma comment(lib,"ws2_32.lib")

#define SERVER_PORT 8888
#define BUFFER_SIZE 1024
#define SERIAL_PORT "COM9"
#define LOG_FILE "DHT_data_log.txt"
#define SEND_INTERVAL 10000 // 10 seconds

SOCKET clientSocket;
struct sockaddr_in serverAddr;
int serverLen;
HANDLE hSerial;
volatile int shouldExit = 0;

// ------------------- Read Arduino -------------------
int readFromArduino(char *buffer, int maxLen){
    DWORD bytesRead;
    if(!ReadFile(hSerial, buffer, maxLen-1, &bytesRead, NULL)) return 0;
    if(bytesRead == 0) return 0;
    buffer[bytesRead] = '\0';
    return (int)bytesRead;
}

// ------------------- Validate -------------------
int validateData(float humidity, float temperature){
    return !(humidity < 0.0 || humidity > 100.0 || temperature < -40.0 || temperature > 80.0);
}

// ------------------- Log -------------------
void analyzeAndLog(char *line, FILE *logFile){
    float humidity = 0, temperature = 0;
    char *p = strstr(line,"Humidity:");
    if(p) sscanf(p,"Humidity: %f",&humidity);
    p = strstr(line,"Temperature:");
    if(p) sscanf(p,"Temperature: %f",&temperature);

    if(validateData(humidity,temperature))
        fprintf(logFile,"[VALID] %s", line);
    else
        fprintf(logFile,"[INVALID] %s", line);

    fflush(logFile);
}

// ------------------- Arduino Thread -------------------
DWORD WINAPI arduinoThread(LPVOID lpParam){
    FILE *file = fopen(LOG_FILE,"a");
    if(!file){ printf("Failed to open log file\n"); return 0; }

    char buffer[BUFFER_SIZE];
    while(!shouldExit){
        if(readFromArduino(buffer,BUFFER_SIZE)){
            printf("%s",buffer);
            analyzeAndLog(buffer,file);
        }
        Sleep(2000);
    }

    fclose(file);
    return 0;
}

// ------------------- Send Log File -------------------
void sendLogFile(){
    FILE *file = fopen(LOG_FILE,"rb");
    if(!file){ printf("Cannot open log file to send\n"); return; }

    char buffer[BUFFER_SIZE];

    // ---------- Register ----------
    sendto(clientSocket, "REGISTER", strlen("REGISTER"), 0, (struct sockaddr*)&serverAddr, serverLen);
    int respLen = recvfrom(clientSocket, buffer, BUFFER_SIZE, 0, (struct sockaddr*)&serverAddr, &serverLen);
    buffer[respLen] = '\0';
    if(strcmp(buffer,"REGISTERED") != 0){
        printf("Registration failed or server full\n");
        fclose(file);
        return;
    }

    // ---------- Request send ----------
    sendto(clientSocket,"REQUEST_SEND",strlen("REQUEST_SEND"),0,(struct sockaddr *)&serverAddr,serverLen);
    respLen = recvfrom(clientSocket, buffer, BUFFER_SIZE, 0, (struct sockaddr*)&serverAddr, &serverLen);
    buffer[respLen] = '\0';
    if(strcmp(buffer,"OK") != 0){
        printf("Server busy, try later\n");
        fclose(file);
        return;
    }

    // ---------- Send filename ----------
    sendto(clientSocket, LOG_FILE, strlen(LOG_FILE), 0, (struct sockaddr*)&serverAddr, serverLen);
    Sleep(50);

    // ---------- Send file content ----------
    int bytesRead;
    while((bytesRead = (int)fread(buffer,1,BUFFER_SIZE,file)) > 0){
        sendto(clientSocket, buffer, bytesRead, 0, (struct sockaddr*)&serverAddr, serverLen);
        Sleep(10);
    }

    // ---------- Send EOF ----------
    strcpy(buffer,"EOF");
    sendto(clientSocket, buffer, strlen(buffer), 0, (struct sockaddr*)&serverAddr, serverLen);

    printf("Log file sent to server.\n");
    fclose(file);
}

// ------------------- Main -------------------
int main(){
    WSADATA wsa;
    if(WSAStartup(MAKEWORD(2,2),&wsa)!=0){ printf("WSAStartup failed\n"); return 1; }

    clientSocket = socket(AF_INET,SOCK_DGRAM,0);
    if(clientSocket==INVALID_SOCKET){ printf("socket() failed\n"); return 1; }

    struct sockaddr_in localAddr;
    localAddr.sin_family = AF_INET;
    localAddr.sin_port = htons(0);
    localAddr.sin_addr.s_addr = INADDR_ANY;
    bind(clientSocket,(struct sockaddr*)&localAddr,sizeof(localAddr));

    char serverIP[50];
    printf("Enter Server IP: ");
    if(scanf("%49s",serverIP)!=1) return 1;

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = inet_addr(serverIP);
    serverLen = sizeof(serverAddr);

    // ---------- Open Serial ----------
    hSerial = CreateFile(SERIAL_PORT,GENERIC_READ,0,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(hSerial==INVALID_HANDLE_VALUE){ printf("Failed to open serial port\n"); return 1; }

    DCB dcbSerial={0};
    dcbSerial.DCBlength=sizeof(dcbSerial);
    GetCommState(hSerial,&dcbSerial);
    dcbSerial.BaudRate=CBR_9600;
    dcbSerial.ByteSize=8;
    dcbSerial.StopBits=ONESTOPBIT;
    dcbSerial.Parity=NOPARITY;
    SetCommState(hSerial,&dcbSerial);

    // ---------- Start Arduino thread ----------
    HANDLE hThread = CreateThread(NULL,0,arduinoThread,NULL,0,NULL);

    printf("Reading DHT11 data and sending logs periodically...\n");

    while(!shouldExit){
        Sleep(SEND_INTERVAL);
        sendLogFile();
    }

    WaitForSingleObject(hThread,2000);
    CloseHandle(hThread);
    closesocket(clientSocket);
    CloseHandle(hSerial);
    WSACleanup();

    return 0;
}
