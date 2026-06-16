import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // app.enableCors({
  //   origin: 'http://localhost:4000',
  //   credentials: true,
  //   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  //   allowedHeaders: ['Content-Type', 'Authorization'],
  // });
  app.enableCors({
    origin: 'http://localhost:4000',
    credentials: true,
  });

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Zatyshok API')
    .setDescription('API documentation for Zatyshok backend')
    .setVersion('1.0')
    .addTag('api')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
