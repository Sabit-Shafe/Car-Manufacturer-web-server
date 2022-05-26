const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.om8d3.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    
    const userCollection = client.db('carparts').collection('users');
    const productsCollection = client.db('carparts').collection('parts');
    const orderCollection = client.db('carparts').collection('order');
    const reviewCollection = client.db('carparts').collection('review');
    const paymentCollection = client.db('carparts').collection('payments');
    const supportCollection = client.db('carparts').collection('support');
    const myprofileCollection = client.db('carparts').collection('myprofile');

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'forbidden' });
      }
    }

    app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
      const order = req.body;
      const price = order.price;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount : amount,
        currency: 'usd',
        payment_method_types:['card']
      });
      res.send({clientSecret: paymentIntent.client_secret})
    });


    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

  

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })

    app.put('/user/admin/:email', verifyJWT, verifyAdmin,  async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2h' })
      res.send({ result, token });
    });

    app.get('/order', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = {email: email};
        const orders = await orderCollection.find(query).toArray();
        return res.send(orders);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    });

    app.get('/order/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const order = await orderCollection.findOne(query);
      res.send(order);
    })

    app.patch('/order/:id', async(req, res) =>{
      const id  = req.params.id;
      const payment = req.body;
      const filter = {_id: ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }

      const result = await paymentCollection.insertOne(payment);
      const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
      res.send(updatedOrder);
    })

    app.get('/review', async (req, res) => {
      const review = await reviewCollection.find().toArray();
      res.send(review);
    })

    app.post('/review',verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    app.post('/order',verifyJWT,  async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    app.get('/product', async (req, res) => {
      const products = await productsCollection.find().toArray();
      res.send(products);
    })

    app.post('/product', verifyJWT, verifyAdmin, async (req, res) => {
      const products = req.body;
      const result = await productsCollection.insertOne(products);
      res.send(result);

    });

    app.post('/myprofile',verifyJWT, async (req, res) => {
      const profile = req.body;
      const result = await myprofileCollection.insertOne(profile);
      res.send(result);
    });

    app.get('/myprofile',async (req, res) => {
      const result = await myprofileCollection.find().toArray();
      res.send(result);
    });

    app.get('/product/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: ObjectId(id) };
      const products = await productsCollection.findOne(query);
      res.send(products);
    });

    app.put('/product/:id', async (req, res) => {
      const id = req.params.id;
      const this_product = await productsCollection.findOne({_id: ObjectId(id)})
      console.log(req.body)
      const product = await productsCollection.updateOne(
        { _id: ObjectId(id) }, 
        { $set: { quantity: this_product.quantity - req.body.quantity } }, 
        { upsert: true }
      )
      res.send(this_product)
    });

    app.delete('/order/:id',verifyJWT, async (req, res) => {
      const result = await orderCollection.deleteOne(
        { _id: ObjectId(req.params.id) },
      );
      res.send(result);
    });

    app.delete('/product/:id',verifyJWT, async (req, res) => {
      const result = await productsCollection.deleteOne(
        { _id: ObjectId(req.params.id) },
      );
      res.send(result);
    });


    app.get('/support', async (req, res) => {
      const query = {};
      const cursor = supportCollection.find(query);
      const support = await cursor.toArray();
      res.send(support);
    });

  }
  finally {

  }
}


run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello car parts manufacture')
})

app.listen(port, () => {
  console.log(`car parts manufacture app listening on port ${port}`)
})