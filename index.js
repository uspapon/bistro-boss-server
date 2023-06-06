const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;
// middleware
app.use(cors());
app.use(express.json());

// creating middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }

  // bearer token
  const token = authorization.split(' ')[1]; // after splitting j array pawa jay tar index #1 thenke token pelam
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    console.log(err);
    if (err) {
      return res.status(401).send({ error: true, message: "Unauthorized access" })
    }

    req.decoded = decoded;
    console.log("jwt found this: ", req.decoded);
    next();
  })

}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ohovvoi.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewCollection = client.db("bistroDB").collection("reviews");
    const cartCollection = client.db("bistroDB").collection("carts");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // JWT
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token });
    })

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log("decoded=", req.decoded.email, "past=", req.decoded.email)
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role != 'admin') {
        return res.status(403).send({ error: true, message: 'Access Forbidden' })
      }
      next();


    }

    // user related API
    /***
     * 1. do not show secure link to those who should not see it
     * 2. use JWTtoken to verify JWT
     * 3. use verify admin middleware
     * TODO :  verifyAdmin, to
     * **/
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      console.log("existing user", existingUser);
      if (existingUser) {
        return res.send({ message: "User Already Exists" });
      }

      const result = await userCollection.insertOne(user);
      console.log("my result", result);
      res.send(result);
    })

    // Security layer 1: jwt
    // Security layer 2: same email
    // Security layer 3: check role (admin/user)

    app.get('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      const decodedEmaill = req.decoded.email;
      if (email !== decodedEmaill) {
        return res.send({ admin: false })

      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);

    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.send(result);
    })

    // menu related API
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      console.log(newItem);
      const result = await menuCollection.insertOne(newItem);
      console.log(result)
      res.send(result);
    })
    app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    // review related API
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // cart related API
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      console.log(result)
      res.send(result);
    })

    // cart collection APIs
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      // jwt checker for valid email but invalid token
      const decodedEmail = req.decoded.email;
      console.log("line 165: ", req.decoded.email, "=", email);
      if (email != decodedEmail) {
        return res.status(403).send({ errro: true, message: 'Forbidden Access' })
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result)
    })
    app.post('/carts', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })

    // Payment Related API
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // payment related API
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ insertResult, deleteResult });
    })

    // admin dashboard related api
    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // best way to get sum of a field is to use group and some operator
      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)

      res.send({
        revenue,
        users,
        products,
        orders
      })

    })

    /*****
     * ------------------------------
     * Bangla system: 2nd best sol
     * PERFORMANCE WILL BE SLOW
     * ------------------------------
     * 1. load all payments
     * 2. for each payments get the menu item array
     * 3. for each items of the menu item array get the menuItem details from the menuCollection
     * 4. put them in an array: allOrderedItems
     * 5. seperate allOrderedItems by cagegory using filter
     * 6. now get the quantity by using length: array.length 
     * 7. for each category use reduce to calculate the total amount of seal by category. 
     *  
     * **/
    app.get('/order-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)

    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send("bistro boss is running");
})

app.listen(port, (req, res) => {
  console.log("bistro boss is running on port: ", port);
})

