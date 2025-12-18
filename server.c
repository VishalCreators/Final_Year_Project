#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>

#pragma comment(lib,"ws2_32.lib")

#define SERVER_PORT 8888
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 5

typedef struct{
    struct sockaddr_in addr;
    int active;
} Client;

Client clients[MAX_CLIENTS];
int clientCount = 0;

SOCKET serverSocket;
CRITICAL_SECTION cs;
int transferInProgress = 0;
int receivingFile = 0;
FILE *currentFile = NULL;
char currentFilename[256] = {0};

// Compare sockaddr
int sockaddr_equal(struct sockaddr_in *a, struct sockaddr_in *b){
    return (a->sin_addr.s_addr == b->sin_addr.s_addr && a->sin_port == b->sin_port);
}

// Find client
int findClient(struct sockaddr_in *addr){
    for(int i=0; i<MAX_CLIENTS; i++){
        if(clients[i].active && sockaddr_equal(&clients[i].addr, addr))
            return i;
    }
    return -1;
}

int main(){
    WSADATA wsa;
    struct sockaddr_in serverAddr, senderAddr;
    char buffer[BUFFER_SIZE];

    WSAStartup(MAKEWORD(2,2), &wsa);
    serverSocket = socket(AF_INET, SOCK_DGRAM, 0);

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    bind(serverSocket, (struct sockaddr*)&serverAddr, sizeof(serverAddr));

    InitializeCriticalSection(&cs);
    CreateDirectoryA("server_storage", NULL);

    printf("Server running on port %d...\n", SERVER_PORT);

    while(1){
        int senderLen = sizeof(senderAddr);
        int recvLen = recvfrom(serverSocket, buffer, BUFFER_SIZE, 0, (struct sockaddr*)&senderAddr, &senderLen);
        if(recvLen <= 0) continue;

        // Only null-terminate commands, not file data
        buffer[recvLen] = '\0';

        EnterCriticalSection(&cs);

        // ---------------- Register client ----------------
        if(strcmp(buffer,"REGISTER") == 0){
            if(clientCount < MAX_CLIENTS){
                clients[clientCount].addr = senderAddr;
                clients[clientCount].active = 1;
                clientCount++;
                sendto(serverSocket,"REGISTERED",10,0,(struct sockaddr*)&senderAddr,senderLen);
                printf("Client registered (%d/%d)\n", clientCount, MAX_CLIENTS);
            } else {
                sendto(serverSocket,"SERVER_FULL",11,0,(struct sockaddr*)&senderAddr,senderLen);
            }
            LeaveCriticalSection(&cs); continue;
        }

        // Ignore unregistered clients
        if(findClient(&senderAddr) == -1){ LeaveCriticalSection(&cs); continue; }

        // ---------------- Request send ----------------
        if(strcmp(buffer,"REQUEST_SEND") == 0){
            if(transferInProgress){
                sendto(serverSocket,"WAIT",4,0,(struct sockaddr*)&senderAddr,senderLen);
            } else {
                transferInProgress = 1;
                receivingFile = 0;
                currentFilename[0] = '\0';
                sendto(serverSocket,"OK",2,0,(struct sockaddr*)&senderAddr,senderLen);
            }
            LeaveCriticalSection(&cs); continue;
        }

        // ---------------- Receive filename ----------------
        if(transferInProgress && !receivingFile){
            snprintf(currentFilename,sizeof(currentFilename),"server_storage/%s",buffer);
            printf("Receiving file: %s\n", currentFilename);

            currentFile = fopen(currentFilename,"wb");
            if(!currentFile){ 
                printf("Failed to create file\n"); 
                transferInProgress = 0; 
                LeaveCriticalSection(&cs); continue; 
            }

            receivingFile = 1;
            LeaveCriticalSection(&cs); continue;
        }

        // ---------------- Receive file data ----------------
        if(transferInProgress && receivingFile){
            if(recvLen == 3 && strncmp(buffer,"EOF",3) == 0){
                fclose(currentFile);
                currentFile = NULL;
                receivingFile = 0;
                transferInProgress = 0;
                printf("File stored successfully: %s\n", currentFilename);
                LeaveCriticalSection(&cs); continue;
            }
            fwrite(buffer, 1, recvLen, currentFile); // binary-safe
            LeaveCriticalSection(&cs); continue;
        }

        LeaveCriticalSection(&cs);
    }

    DeleteCriticalSection(&cs);
    closesocket(serverSocket);
    WSACleanup();
    return 0;
}