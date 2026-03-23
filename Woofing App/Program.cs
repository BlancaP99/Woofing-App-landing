var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Redirige a HTTPS
app.UseHttpsRedirection();

// Busca automáticamente index.html en wwwroot
app.UseDefaultFiles();

// Sirve archivos estáticos desde wwwroot
app.UseStaticFiles();

app.Run();
