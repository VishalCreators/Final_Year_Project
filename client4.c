#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>

#pragma comment(lib,"ws2_32.lib")

#define SERVER_PORT 8888
#define BUF_SIZE 1024
#define LOG_FILE "node_data_log.txt"

#define NODE_ID 4          // 🔴 change for each client
#define SEND_INTERVAL 10000

int main() {
    WSADATA wsa;
    SOCKET sock;
    struct sockaddr_in serverAddr;
    char buffer[BUF_SIZE];

    WSAStartup(MAKEWORD(2,2), &wsa);
    sock = socket(AF_INET, SOCK_DGRAM, 0);

    char serverIP[50];
    printf("Enter Server IP: ");
    scanf("%49s", serverIP);

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = inet_addr(serverIP);

    printf("Node %d running...\n", NODE_ID);

    /* -------- REGISTER ONCE -------- */
    sprintf(buffer, "REGISTER:NODE:%d", NODE_ID);
    sendto(sock, buffer, strlen(buffer), 0,
           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

    Sleep(100);

    while (1) {
        FILE *fp = fopen(LOG_FILE, "r");
        if (!fp) {
            Sleep(SEND_INTERVAL);
            continue;
        }

        sprintf(buffer, "NODE:%d", NODE_ID);
        sendto(sock, buffer, strlen(buffer), 0,
               (struct sockaddr*)&serverAddr, sizeof(serverAddr));

        Sleep(50);

        while (fgets(buffer, BUF_SIZE, fp)) {
            char sendBuf[BUF_SIZE];
            sprintf(sendBuf, "DATA:%s", buffer);
            sendto(sock, sendBuf, strlen(sendBuf), 0,
                   (struct sockaddr*)&serverAddr, sizeof(serverAddr));
            Sleep(20);
        }

        sendto(sock, "EOF", 3, 0,
               (struct sockaddr*)&serverAddr, sizeof(serverAddr));

        fclose(fp);

        printf("Node %d data sent\n", NODE_ID);
        Sleep(SEND_INTERVAL);
    }

    closesocket(sock);
    WSACleanup();
    return 0;
}
