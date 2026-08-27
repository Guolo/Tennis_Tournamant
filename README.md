# Tennis_Tournamant
Organize round-robin tennis tournaments and save the results in a database visible on the homepage.
The application is publicly deployed and available at: tennis.guolo.eu

<img width="295" height="515" alt="IMG_1621" src="https://github.com/user-attachments/assets/7f4bb449-7202-432b-bb61-1fb0d4d621e8" /> <img width="295" height="515" alt="IMG_1622" src="https://github.com/user-attachments/assets/532ed341-0aeb-4bd6-a3a8-86cecaa48478" />

# Installation
Prerequisites:  
[Docker](https://www.docker.com) and [Docker Compose](https://docs.docker.com/compose/) installed on your system.

Create a ```docker-compose.yml``` file:
```
services:
  fix-permessi-db:
    image: busybox
    command: sh -c "mkdir -p /data && chown -R 1000:1000 /data"
    volumes:
      - ./db/data:/data

  tennis-app:
    image: alguolo/tennis
    container_name: tennis
    depends_on:
      fix-permessi-db:
        condition: service_completed_successfully
    ports:
      - "3333:3333"
    environment:
      - PORT=3333
    volumes:
      - ./db/data:/app/db/data
    restart: unless-stopped
```

Start your docker compose:
```
docker compose up -d
```
The image is built for multiple architectures — Docker will automatically pull the correct version for your system (amd64 or arm64).

> [!IMPORTANT]
> When the app is launched, the data folder is created inside the db folder. The data folder contains the actual database. If deleted, your data will be lost!
# Access the App

Once the container is running, you can access the interface at:
```
http://your_ip:3333
```
# How to use the App
On the homepage, you can view all past tournaments in read-only mode.

Clicking "New Tournament" will prompt you to enter a tournament name (if left blank, the seed will be used as the name) and the names of the players.

When the tournament starts, a unique seed is generated for it, and random matches are created between the participants. The seed is only used if you want to access the tournament from multiple devices or if you accidentally close the tournament page. From the homepage, you can resume an ongoing tournament using its seed.

From the tournament interface, you can assign set scores for each match, skip a match to play it later, view upcoming matches, and check the real-time standings. All set results remain editable at any time until you click "End Tournament".
Once "End Tournament" is clicked, the results are officially saved to the database and become publicly accessible to anyone using the app. It is impossible to delete a tournament after clicking "End Tournament", except via the command line — a deliberate choice to prevent any issues.

If you wish to abandon a tournament or avoid saving its data publicly, simply close the tournament page or return home without clicking "End Tournament". After 14 days, the tournament will be automatically deleted, and its data will be lost.
