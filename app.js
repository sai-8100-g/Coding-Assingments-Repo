const express = require('express')
const app = express()
app.use(express.json())

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const intializer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000)
  } catch (e) {
    console.log(`DB error : ${e.message}`)
    process.exit(1)
  }
}

intializer()

const authenticateToken = async (request, response, next) => {
  let jwtToken = null
  const headerInfo = request.headers['authorization']
  if (headerInfo !== undefined) {
    jwtToken = headerInfo.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    await jwt.verify(jwtToken, 'SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const userCheck = `
    SELECT 
    * 
    FROM 
    user
    WHERE 
    username LIKE '${username}';`

  const result = await db.get(userCheck)
  if (result !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hasedPassword = await bcrypt.hash(password, 10)
      const postingQurey = `
        INSERT INTO 
        user(username, password, name, gender)
        VALUES('${username}', '${hasedPassword}',
                '${name}', '${gender}')
        `
      await db.run(postingQurey)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userCheck = `
  SELECT 
  * 
  FROM 
  user
  WHERE
  username LIKE '${username}';`
  const result = await db.get(userCheck)
  if (result === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    isPasswordMatched = await bcrypt.compare(password, result.password)
    if (isPasswordMatched === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {
        username: username,
      }
      const jwtToken = await jwt.sign(payload, 'SECRET_TOKEN')
      response.send({
        jwtToken: jwtToken,
      })
    }
  }
})

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getTweetFeed = `
  SELECT 
  user.username,
  tweet.tweet,
  tweet.date_time
  FROM
  follower INNER JOIN tweet ON
   follower.follower_user_id = tweet.user_id
   INNER JOIN user ON user.user_id = tweet.user_id
   WHERE
   follower.following_user_id IN (
                                    SELECT 
                                    follower.following_user_id
                                    FROM
                                    follower INNER JOIN user 
                                    ON follower.follower_user_id = user.user_id
                                    WHERE 
                                    user.username LIKE '${username}')
                                    AND NOT user.user_id = (
                                      SELECT
                                      user_id
                                      FROM
                                      user
                                      WHERE 
                                      username like '${username}'
                                    )

    ORDER BY 
    date_time DESC
    LIMIT 4;`
  const result = await db.all(getTweetFeed)
  response.send(
    result.map(each => {
      return {
        username: each.username,
        tweet: each.tweet,
        dateTime: each.date_time,
      }
    }),
  )
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserName = `
  SELECT DISTINCT
  user.username
  FROM
  follower INNER JOIN tweet ON
   follower.follower_user_id = tweet.user_id
   INNER JOIN user ON user.user_id = tweet.user_id
   WHERE
   follower.following_user_id IN (
                                    SELECT 
                                    follower.following_user_id
                                    FROM
                                    follower INNER JOIN user 
                                    ON follower.follower_user_id = user.user_id
                                    WHERE 
                                    user.username LIKE '${username}')
                                     AND NOT user.user_id = (
                                      SELECT
                                      user_id
                                      FROM
                                      user
                                      WHERE 
                                      username like '${username}'
                                    );`

  const result = await db.all(getUserName)
  console.log(result)
  response.send(
    result.map(each => {
      return {
        name: each.username,
      }
    }),
  )
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserName = `
  SELECT DISTINCT
  user.username
  FROM
  follower INNER JOIN user 
  ON 
  user.user_id = follower.following_user_id
   WHERE
   follower.follower_user_id IN (
                                    SELECT 
                                    follower.follower_user_id
                                    FROM
                                    follower INNER JOIN user 
                                    ON follower.following_user_id = user.user_id
                                    WHERE 
                                    user.username LIKE '${username}')
                                     AND NOT user.user_id = (
                                      SELECT
                                      user_id
                                      FROM
                                      user
                                      WHERE 
                                      username like '${username}'
                                    );`

  const result = await db.all(getUserName)
  console.log(result)
  response.send(
    result.map(each => {
      return {
        name: each.username,
      }
    }),
  )
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getUserName = `
  SELECT 
  tweet.tweet,
  count(like.like_id) as likes,
  count(reply.reply_id) as replies,
  tweet.date_time as dateTime
  FROM
  follower INNER JOIN tweet ON
   follower.follower_user_id = tweet.user_id
   LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id
   LEFT JOIN like ON tweet.tweet_id = like.tweet_id 
   INNER JOIN user ON user.user_id = tweet.tweet_id
   WHERE
   follower.following_user_id IN (
                                    SELECT 
                                    follower.following_user_id
                                    FROM
                                    follower INNER JOIN tweet 
                                    ON follower.follower_user_id = tweet.user_id
                                    INNER JOIN user ON tweet.user_id = user.user_id
                                    WHERE                                 
                                    user.username LIKE '${username}' )
                                    AND tweet.tweet_id = '${tweetId}'
                                     AND NOT user.user_id = (
                                      SELECT
                                      user_id
                                      FROM
                                      user
                                      WHERE 
                                      username like '${username}'
                                    );`

  const result = await db.get(getUserName)
  if (result.tweet === null) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(result)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getWhoLikedTweet = `
     SELECT 
    DISTINCT u.username 
     FROM
     user as u INNER JOIN tweet as t ON 
     u.user_id = t.user_id INNER JOIN follower as f ON 
     t.user_id = f.follower_user_id INNER JOIN like as l ON 
     t.tweet_id = l.tweet_id
     WHERE 
     t.tweet_id = '${tweetId}'
     AND
     f.follower_user_id IN (
                  SELECT
                  follower_user_id
                  FROM
                  follower
                  WHERE 
                  following_user_id IN (
                   SELECT
                   f.following_user_id
                   FROM
                   user as u INNER JOIN follower as f
                   ON u.user_id = f.follower_user_id 
                   WHERE 
                   u.username LIKE '${username}'
                  )
     )
  `

    const result = await db.all(getWhoLikedTweet)
    console.log(result)
    let namesArray = []
    result.map(eachItem => {
      namesArray.push(eachItem.username)
    })
    console.log(namesArray)
    if (result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({
        likes: namesArray,
      })
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getWhoReplies = `
  SELECT DISTINCT
  u.username as name,
  r.reply as reply 
  FROM
  reply as r INNER JOIN tweet as t 
  ON r.tweet_id = t.tweet_id INNER JOIN follower as f 
  ON f.follower_user_id = t.user_id INNER JOIN user as u 
  ON t.user_id = u.user_id
  WHERE 
  t.tweet_id = '${tweetId}'
  AND
  f.follower_user_id IN (
                  SELECT
                  follower_user_id
                  FROM
                  follower
                  WHERE 
                  following_user_id IN (
                   SELECT
                   f.following_user_id
                   FROM
                   user as u INNER JOIN follower as f
                   ON u.user_id = f.follower_user_id 
                   WHERE 
                   u.username LIKE '${username}'
                  )
  )
  `
    const result = await db.all(getWhoReplies)
    if (result === null || result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send(result)
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserTweets = `
  SELECT
  t.tweet,
  count(l.like_id) as likes,
  count(r.reply_id) as replies,
  t.date_time as dateTime
  FROM
  user as u INNER JOIN tweet as t 
  ON u.user_id = t.user_id LEFT JOIN 
  like as l ON t.tweet_id = l.tweet_id 
  LEFT JOIN reply as r ON r.tweet_id = r.tweet_id
 WHERE
 u.username LIKE '${username}'
  `
  const result = await db.all(getUserTweets)
  response.send(result)
})

app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {tweet} = req.body
  const createTweet = `
   INSERT INTO 
   tweet(tweet)
   VALUES('${tweet}')
  `
  await db.run(createTweet)
  res.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserTweet = `
    SELECT
    t.tweet_id
    FROM
    user as u JOIN tweet as t ON 
    u.user_id = t.tweet_id
    WHERE 
    u.username LIKE '${username}'
    AND t.tweet_id = '${tweetId}';
    `
    const usedetails = await db.get(getUserTweet)
    console.log(usedetails)
    if (usedetails === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deletingTweets = `
    DELETE FROM
    tweet 
    WHERE 
    tweet_id = (
      SELECT 
      t.tweet_id
      FROM
      tweet as t INNER JOIN user as u ON 
      u.user_id = t.user_id 
      WHERE 
      u.username LIKE '${username}'
      AND 
      t.tweet_id = '${tweetId}'
    )
    ;
    `
      await db.run(deletingTweets)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
