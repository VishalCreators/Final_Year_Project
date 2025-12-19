#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>

#pragma comment(lib,"ws2_32.lib")

#define SERVER_PORT 8888
#define BUFFER_SIZE 1024
#define MAX_NODES 5

typedef struct{
    int nodeId;
    FILE *file;
} NodeSession;

NodeSession sessions[MAX_NODES];
SOCKET serverSocket;

/* ---------- Get or Create Node File ---------- */
FILE* getNodeFile(int nodeId){
    for(int i = 0; i < MAX_NODES; i++){
        if(sessions[i].nodeId == nodeId)
            return sessions[i].file;
    }

    for(int i = 0; i < MAX_NODES; i++){
        if(sessions[i].nodeId == 0){
            sessions[i].nodeId = nodeId;

            char filename[100];
            sprintf(filename, "server_storage/node_%d.txt", nodeId);

            sessions[i].file = fopen(filename, "a");
            return sessions[i].file;
        }
    }
    return NULL;
}

int main(){
    WSADATA wsa;
    struct sockaddr_in serverAddr, clientAddr;
    char buffer[BUFFER_SIZE];
    int currentNode = -1;

    printf("Starting server...\n");
    WSAStartup(MAKEWORD(2,2), &wsa);

    serverSocket = socket(AF_INET, SOCK_DGRAM, 0);
    if(serverSocket == INVALID_SOCKET){
        printf("Socket creation failed\n");
        return 1;
    }

    BOOL reuse = TRUE;
    setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR,
               (char*)&reuse, sizeof(reuse));

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = INADDR_ANY;

    if(bind(serverSocket, (struct sockaddr*)&serverAddr,
            sizeof(serverAddr)) < 0){
        printf("Bind failed. Error: %d\n", WSAGetLastError());
        return 1;
    }

    CreateDirectoryA("server_storage", NULL);

    printf("Flood Detection Server running on UDP port %d\n\n",
           SERVER_PORT);

    while(1){
        int len = sizeof(clientAddr);
        int recvLen = recvfrom(serverSocket, buffer,
                               BUFFER_SIZE-1, 0,
                               (struct sockaddr*)&clientAddr, &len);

        if(recvLen <= 0) continue;

        buffer[recvLen] = '\0';
        printf("Received: %s\n", buffer);

        if(strncmp(buffer, "NODE:", 5) == 0){
            currentNode = atoi(buffer + 5);
            printf("Receiving from Node %d\n", currentNode);
        }
        else if(strncmp(buffer, "DATA:", 5) == 0 && currentNode != -1){
            FILE *f = getNodeFile(currentNode);
            if(f){
                fprintf(f, "%s", buffer + 5);
                fflush(f);
            }
        }
        else if(strcmp(buffer, "EOF") == 0){
            printf("Node %d transmission completed\n\n", currentNode);
            currentNode = -1;
        }
    }

    closesocket(serverSocket);
    WSACleanup();
    return 0;
}
