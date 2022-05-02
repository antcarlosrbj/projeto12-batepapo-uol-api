import dayjs from 'dayjs';
import express from 'express';
import joi from 'joi';
import { MongoClient } from "mongodb";
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

/* --------------------- CONECTANDO AO BANCO ---------------------- */

let participants;

let db;
const mongoClient = new MongoClient("mongodb://localhost:27017");

async function findParticipants() {
    try {
        await mongoClient.connect()
        db = mongoClient.db("uol");
        participants = await db.collection("participants").find({}).toArray();
    } catch (error) {
        res.status(500).send('Erro ao conectar o banco de dados')
        console.log(error)
    }
}

/* --------------------- PARTICIPANTS (POST) ---------------------- */

app.post("/participants", async (req, res) => {

    const participant = req.body;

    /* VERIFICAÇÃO - CONTER "NAME" E NÃO ESTAR VAZIO */

    const userSchemaEmpty = joi.object({
        name: joi.string().required()
    });

    const validationEmpty = userSchemaEmpty.validate(participant);

    if (validationEmpty.error) {
        res.status(422).send("O nome e apenas ele deve ser preenchido");
        return
    }

    /* VERIFICAÇÃO - NÃO SER REPETIDO */

    await findParticipants();
    if (participants.find(e => e.name === participant.name)) {
        res.status(409).send("O nome já existe");
        return
    }

    /* INSERINDO NO BANCO DE DADOS */

    try {
        await db.collection("participants").insertOne({
            name: participant.name,
            lastStatus: Date.now()
        });

        await db.collection("messages").insertOne({
            from: participant.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs(Date.now()).format('HH:mm:ss')
        });

        res.status(201).send("Participante adicionado com sucesso")

        /* CASO ERRO */

    } catch (error) {
        res.status(500).send('Erro ao adicionar participante no banco de dados')
        console.log(error)
    }

});

/* ---------------------- PARTICIPANTS (GET) ---------------------- */

app.get("/participants", async (req, res) => {
    try {
        await findParticipants();
        res.send(participants);
    } catch (error) {
        res.status(500).send('Erro ao buscar participantes no banco de dados')
        console.log(error)
    }
});

/* ----------------------- MESSAGES (POST) ------------------------ */

app.post("/messages", async (req, res) => {
    try {
        const message = {
            from: req.headers.user,
            to: req.body.to,
            text: req.body.text,
            type: req.body.type,
            time: dayjs(Date.now()).format('HH:mm:ss')
        };

        /* VERIFICAÇÃO */

        const userSchemaMessage = joi.object({
            from: joi.string().required(),
            to: joi.string().required(),
            text: joi.string().required(),
            type: joi.string().pattern(new RegExp('^(message|private_message)$')),
            time: joi.string().required()
        });

        const validationMessage = userSchemaMessage.validate(message);

        await findParticipants();

        if (validationMessage.error || !(participants.find(e => e.name === message.from))) {
            res.sendStatus(422);
            return
        }

        /* INSERINDO NO BANCO DE DADOS */

        await db.collection("messages").insertOne(message);
        res.sendStatus(201)

        /* CASO ERRO */

    } catch (error) {
        res.status(500).send('Erro ao adicionar mensagem no banco de dados')
        console.log(error)
    }
});

/* ------------------------ MESSAGES (GET) ------------------------ */

app.get("/messages", async (req, res) => {
    try {

        /* BUSCANDO MENSAGENS NO BANCO DE DADOS */

        let messages;
        await mongoClient.connect()
        db = mongoClient.db("uol");
        messages = await db.collection("messages").find({}).toArray();

        /* FILTRANDO AS MENSAGENS A SEREM ENVIADAS */

        let limit;
        if (req.query.limit) {
            limit = req.query.limit;
        } else {
            limit = Infinity;
        }

        let messagesToSend = [];
        for (let i = 1, qty = 0; qty < limit && i <= messages.length; i++) {
            let message = messages[messages.length - i];
            if (!(
                message.from !== req.headers.user &&
                message.to !== req.headers.user &&
                message.type === "private_message"
            )) {
                messagesToSend.push(message);
                qty++;
            }
        }

        /* ENVIANDO MENSAGENS */

        res.send(messagesToSend.reverse());

        /* CASO ERRO */

    } catch (error) {
        res.status(500).send('Erro ao buscar mensagens no banco de dados')
        console.log(error)
    }
});

/* ------------------------ STATUS (POST) ------------------------- */

app.post("/status", async (req, res) => {
    try {
        await mongoClient.connect()
        db = mongoClient.db("uol");
        let participant = await db.collection("participants").find({ name: req.headers.user }).toArray();
        if (!participant.length) {
            res.sendStatus(404);
            return;
        }

        await db.collection("participants").updateOne(
            {
                name: req.headers.user
            }, {
            $set: {
                lastStatus: Date.now()
            }
        }
        );

        res.sendStatus(200);

    } catch (error) {
        res.status(500).send('Erro ao acessar o banco de dados')
        console.log(error)
    }
});

/* --------------------- REMOÇÃO DE INATIVOS ---------------------- */

setInterval(async () => {
    try {

        /* LISTANDO INATIVOS */

        await findParticipants();

        const blackList = participants.filter(
            participant => participant.lastStatus < Date.now() - 10000
        )

        /* EXCLUINDO INATIVOS E INSERINDO MENSAGEM */

        await mongoClient.connect()
        db = mongoClient.db("uol");

        blackList.forEach(async (participant) => {
            await db.collection("participants").deleteOne({name: participant.name});
            await db.collection("messages").insertOne({
                from: participant.name, 
                to: 'Todos', 
                text: 'sai da sala...', 
                type: 'status', 
                time: dayjs(Date.now()).format('HH:mm:ss')
            });
        });

        /* CASO ERRO */

    } catch (error) {
        res.status(500).send('Erro ao buscar participantes no banco de dados')
        console.log(error)
    }
}, 15000);

/* ---------------------------------------------------------------- */

app.listen(5000);