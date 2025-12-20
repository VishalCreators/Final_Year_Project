#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <windows.h>
#include <time.h>

#pragma comment(lib,"ws2_32.lib")

#define SERVER_PORT 8888
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 10

typedef struct {
    struct sockaddr_in addr;
    int registered;
    int nodeId;
} Client;

Client clients[MAX_CLIENTS];
int clientCount = 0;
CRITICAL_SECTION cs;

/* ---------- GET TIMESTAMP ---------- */
void getTimestamp(char *timeBuf, int size) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    strftime(timeBuf, size, "%Y-%m-%d %H:%M:%S", t);
}

/* ---------- LOG TO FILE (Structured) ---------- */
void logToFile(int nodeId, const char *eventType, const char *data) {
    FILE *fp = fopen("server_log.txt", "a");  // structured file
    if (!fp) return;

    char timeBuf[64];
    getTimestamp(timeBuf, sizeof(timeBuf));

    if (nodeId > 0)
        fprintf(fp, "[%s] Node%d %s -> %s\n", timeBuf, nodeId, eventType, data);
    else
        fprintf(fp, "[%s] %s -> %s\n", timeBuf, eventType, data);

    fclose(fp);
}

/* ---------- FIND NODE ID BY ADDR ---------- */
int getNodeIdByAddr(struct sockaddr_in *addr) {
    for (int i = 0; i < clientCount; i++) {
        if (clients[i].registered &&
            clients[i].addr.sin_addr.s_addr == addr->sin_addr.s_addr &&
            clients[i].addr.sin_port == addr->sin_port) {
            return clients[i].nodeId;
        }
    }
    return -1; // unknown
}

/* ---------- REGISTER CLIENT ---------- */
void registerClient(struct sockaddr_in *addr, int nodeId) {
    EnterCriticalSection(&cs);

    for (int i = 0; i < clientCount; i++) {
        if (clients[i].nodeId == nodeId) {
            LeaveCriticalSection(&cs);
            return;
        }
    }

    if (clientCount < MAX_CLIENTS) {
        clients[clientCount].addr = *addr;
        clients[clientCount].nodeId = nodeId;
        clients[clientCount].registered = 1;
        clientCount++;
    }

    LeaveCriticalSection(&cs);
}

/* ================= MAIN ================= */
int main() {
    WSADATA wsa;
    SOCKET serverSocket;
    struct sockaddr_in serverAddr, clientAddr;
    char buffer[BUFFER_SIZE];
    int addrLen = sizeof(clientAddr);

    InitializeCriticalSection(&cs);

    WSAStartup(MAKEWORD(2,2), &wsa);
    serverSocket = socket(AF_INET, SOCK_DGRAM, 0);

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = INADDR_ANY;

    bind(serverSocket, (struct sockaddr*)&serverAddr, sizeof(serverAddr));

    printf("✅ Server running on port %d\n", SERVER_PORT);

    while (1) {
        int bytes = recvfrom(
            serverSocket,
            buffer,
            BUFFER_SIZE - 1,
            0,
            (struct sockaddr*)&clientAddr,
            &addrLen
        );

        if (bytes <= 0)
            continue;

        buffer[bytes] = '\0';

        char timeBuf[64];
        getTimestamp(timeBuf, sizeof(timeBuf));

        /* ---------- NODE ID MESSAGE (Auto-register) ---------- */
        if (strncmp(buffer, "NODE:", 5) == 0) {
            int nodeId = 0;
            sscanf(buffer, "NODE:%d", &nodeId);

            int existingId = getNodeIdByAddr(&clientAddr);
            if (existingId == -1 && nodeId > 0) {
                registerClient(&clientAddr, nodeId);
                printf("[%s] 🟢 Node %d auto-registered\n", timeBuf, nodeId);
                logToFile(nodeId, "REGISTER", "Auto-registered via NODE message");
            }
            continue; // skip further processing for this message
        }

        /* ---------- REGISTER ---------- */
        if (strncmp(buffer, "REGISTER", 8) == 0) {
            int nodeId;
            sscanf(buffer, "REGISTER:NODE:%d", &nodeId);
            registerClient(&clientAddr, nodeId);

            printf("[%s] 🟢 Node %d registered\n", timeBuf, nodeId);
            logToFile(nodeId, "REGISTER", "Node registered successfully");
        }

        /* ---------- DATA ---------- */
        else if (strncmp(buffer, "DATA:", 5) == 0) {
            int nodeId = getNodeIdByAddr(&clientAddr);
            if (nodeId == -1) nodeId = 0; // fallback unknown

            printf("[%s] 📡 Node%d transmitted -> %s\n", timeBuf, nodeId, buffer);
            logToFile(nodeId, "DATA", buffer);

            /* Broadcast to all nodes */
            EnterCriticalSection(&cs);
            for (int i = 0; i < clientCount; i++) {
                sendto(
                    serverSocket,
                    buffer,
                    strlen(buffer),
                    0,
                    (struct sockaddr*)&clients[i].addr,
                    sizeof(clients[i].addr)
                );
            }
            LeaveCriticalSection(&cs);
        }

        /* ---------- EOF ---------- */
        else if (strcmp(buffer, "EOF") == 0) {
            int nodeId = getNodeIdByAddr(&clientAddr);
            if (nodeId == -1) nodeId = 0;
            printf("[%s] 🔚 Node%d End of transmission\n", timeBuf, nodeId);
            logToFile(nodeId, "EOF", "End of transmission");
        }

        /* ---------- UNKNOWN ---------- */
        else {
            int nodeId = getNodeIdByAddr(&clientAddr);
            if (nodeId == -1) nodeId = 0;
            printf("[%s] ⚠ Node%d Unknown: %s\n", timeBuf, nodeId, buffer);
            logToFile(nodeId, "UNKNOWN", buffer);
        }
    }

    closesocket(serverSocket);
    WSACleanup();
    DeleteCriticalSection(&cs);
    return 0;
}