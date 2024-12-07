"use strict";

const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');
const { config, port, redirectee } = require("./config");
const app = express();
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../traefik/dyn-whitelist.toml');

function updateTraefikConfig(updates) {
    let config = fs.readFileSync(configPath, 'utf-8');
    const ipRegex = /sourceRange\s*=\s*\[(.*?)\]/s;
    const commentRegex = /#\s*(.*)/g;
    let currentIPs = [];
    let currentComments = [];

    if (ipRegex.test(config)) {
        currentIPs = ipRegex.exec(config)[1].split(',').map(ip => ip.trim().replace(/["']/g, ''));
    }
    config.replace(commentRegex, (_, comment) => currentComments.push(comment.trim()));

    const existingData = {};
    currentComments.forEach((username, index) => {
        existingData[username] = currentIPs[index];
    });

    for (const [username, ip] of updates) {
        if (username) existingData[username] = ip;
    }

    const newIPs = [];
    const newComments = [];

    for (const [username, ip] of Object.entries(existingData)) {
        newIPs.push(ip);
        newComments.push(`# ${username}`);
    }

    const updatedIPList = `sourceRange = [${newIPs.map(ip => `"${ip}"`).join(', ')}]`;
    const updatedComments = newComments.join('\n');

    config = config.replace(ipRegex, updatedIPList);
    config = updatedComments + '\n' + config.replace(/#.*\n/g, '');

    fs.writeFileSync(configPath, config, 'utf-8');
}

app.use(auth(config));

app.get('/', requiresAuth(), (req, res) => {
    if (!req?.oidc?.accessToken) return;
    if (req.headers["x-real-ip"] == req.headers["x-forwarded-for"]) {
        console.log(`${req.headers["x-real-ip"]} - ${req?.oidc?.idTokenClaims?.name}`);
        let arr = []; arr.push([req?.oidc?.idTokenClaims?.name, req.headers["x-real-ip"]]);
        updateTraefikConfig(arr);
        res.redirect(redirectee);
    }
});

app.use('/', requiresAuth(), express.static('serve'));

app.listen(port, function () {
    console.log(`Base is listening on ${port}.`)
});